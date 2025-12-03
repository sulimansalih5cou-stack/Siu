// 🔥 تهيئة واستيراد Firebase SDK
// يجب التأكد من صحة إصدارات المكتبات وروابطها
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase - يجب تغيير هذه القيم إلى إعدادات مشروعك
const firebaseConfig = {
    apiKey: "AIzaSyA2GNsXj4DzWyCYLKuVT3i1XBKfjX3ccuM",
    authDomain: "siu-students.firebaseapp.com",
    databaseURL: "https://siu-students-default-rtdb.firebaseio.com",
    projectId: "siu-students",
    storageBucket: "siu-students.firebasestorage.app",
    messagingSenderId: "76007314543",
    appId: "1:76007314543:web:4850b668cec4b93bdc699a",
    measurementId: "G-SB6884R2FX"
};

try {
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const auth = getAuth(app);
    window.db = db; // لتسهيل الوصول في Console إذا لزم الأمر
    window.auth = auth;
} catch (e) {
    console.error("Firebase Initialization Error: Check your firebaseConfig object.", e);
    alert("خطأ حاسم في تهيئة الاتصال بقاعدة البيانات. تحقق من إعدادات Firebase.");
}


// متغيرات عامة
let allUsers = [];
let currentUserID = null;
let currentUserDB = null;
let allExpenses = [];
let activeFilter = '30days';
let userNotifications = [];
let allSettlements = []; // ✨ جديد: لتخزين سجلات التسويات
let netBalances = {};

// متغيرات مودال التسوية
let currentSettleUser = '';
let currentSettleMaxAmount = 0;
let currentSettleRecipientUID = ''; 

// ============================================================
// 🛠️ دوال مساعدة عامة
// ============================================================
function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم غير معروف';
}
function roundToTwo(num) {
    return Math.round(num * 100) / 100;
}
window.formatNumber = function(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US');
    }
};
function formatBankDate(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const dateObj = new Date(timestamp);
    const day = dateObj.getDate();
    const month = dateObj.toLocaleString('ar-EG', { month: 'short' });
    const year = dateObj.getFullYear();
    const date = `${day}-${month}-${year}`;
    const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { date, time };
}

// ============================================================
// 🏠 منطق الصفحة الرئيسية (Home Logic)
// ============================================================
function updateHomeDisplay() {
    const balanceEl = document.getElementById('currentBalance');
    const nameEl = document.getElementById('userNamePlaceholder');
    const cardEl = document.getElementById('currentBalanceCard');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarEmail = document.getElementById('sidebarUserEmail');

    if (!balanceEl && !nameEl) return;

    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;

    if (nameEl) nameEl.textContent = displayName;

    if (sidebarName) sidebarName.textContent = displayName;
    if (sidebarEmail && auth.currentUser) sidebarEmail.textContent = auth.currentUser.email || '';

    const balance = (currentUserDB && currentUserDB.balance !== undefined) ? currentUserDB.balance : 0;
    if (balanceEl) {
        balanceEl.textContent = balance.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2});
    }
    if (cardEl) {
        if (balance < -0.1) {
            cardEl.classList.add('negative');
        } else {
            cardEl.classList.remove('negative');
        }
    }
}

function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';
    if (!currentUserID) return;
    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <label class="flex items-center w-full cursor-pointer">
                <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-5 w-5 text-blue-600">
                <span class="mr-2 font-semibold text-gray-700 select-none">${user.displayName}</span>
            </label>
        `;
        container.appendChild(div);
    });
}

window.selectAllParticipants = function() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
};

// ============================================================
// 📊 منطق المصروفات الشخصية (My Expenses Logic)
// ============================================================
function displayPersonalExpenses() {
    const container = document.getElementById('personalExpensesContainer');
    const noExpensesEl = document.getElementById('noPersonalExpenses');
    const totalExpensesEl = document.getElementById('totalPersonalExpenses');

    if (!container) return;
    container.innerHTML = '';
    let totalPersonalDebt = 0;

    const personalList = allExpenses.filter(expense => expense.participants_ids.includes(currentUserID) )
                                     .sort((a, b) => b.timestamp - a.timestamp);

    if (personalList.length === 0) {
        if(noExpensesEl) noExpensesEl.classList.remove('hidden');
        if(totalExpensesEl) totalExpensesEl.textContent = '0.00';
        return;
    }

    if(noExpensesEl) noExpensesEl.classList.add('hidden');

    personalList.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isMessenger = expense.is_messenger || false;
        const share = expense.share;
        let displayAmount = 0;
        let mainTitle;
        const { date, time } = formatBankDate(expense.timestamp);

        // إذا كان الدافع ومرسال والحصة 0، نتجاهل هذا المصروف من هذه القائمة
        if (isPayer && isMessenger && share < 0.1) return;

        if (isPayer && !isMessenger) {
            displayAmount = share;
            mainTitle = `حصتك الخاصة في مصروف: ${expense.title}`;
            totalPersonalDebt += displayAmount;
        } else if (expense.participants_ids.includes(currentUserID) && !isPayer) {
            displayAmount = share;
            const payerName = getUserNameById(expense.payer_id);
            mainTitle = `دين عليك لـ ${payerName} في مصروف: ${expense.title}`;
            totalPersonalDebt += displayAmount;
        } else {
            return;
        }
        
        if(displayAmount < 0.1) return;

        const amountDisplay = displayAmount.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2});

        const cardHTML = `
            <div class="bankak-card">
                <div class="card-main-content">
                    <div class="details-wrapper">
                        <div class="bank-icon-container icon-danger ml-3">
                            <i class="fas fa-minus-circle"></i>
                        </div>
                        <div class="details-text text-right">
                            <p class="transaction-title">${expense.title}</p>
                            <p class="transaction-sub"> ${mainTitle} </p>
                        </div>
                    </div>
                    <div class="amount-display amount-neg"> - ${amountDisplay} <span class="text-sm font-normal">SDG</span> </div>
                </div>
                <div class="card-footer-date">
                    <span><i class="far fa-calendar-alt ml-1"></i> ${date}</span>
                    <span><i class="far fa-clock ml-1"></i> ${time}</span>
                </div>
            </div>
        `;
        container.innerHTML += cardHTML;
    });

    if (totalExpensesEl) {
        totalExpensesEl.textContent = totalPersonalDebt.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2});
    }
}

// ============================================================
// 💰 منطق ملخص التسوية (Settlement Summary Logic)
// ============================================================

function calculateNetBalances() {
    if (!currentUserID || allUsers.length === 0) return;

    netBalances = {};
    allUsers.forEach(user => {
        if (user.uid !== currentUserID) {
            netBalances[user.uid] = 0;
        }
    });

    // 1. حساب الأرصدة بناءً على المصروفات (الديون والمستحقات الأولية)
    allExpenses.forEach(expense => {
        const payerId = expense.payer_id;
        const share = expense.share;
        const isMessenger = expense.is_messenger || false;

        // 1.1. أنت الدافع (أنت دائن للآخرين) -> الرصيد موجب
        if (payerId === currentUserID) {
            const participantsToCheck = isMessenger 
                ? expense.participants_ids.filter(id => id !== currentUserID)
                : expense.participants_ids.filter(id => id !== currentUserID);
            
            participantsToCheck.forEach(participantId => {
                if(netBalances[participantId] !== undefined) {
                    // زيادة المستحق لك من هذا الشخص
                    netBalances[participantId] = roundToTwo(netBalances[participantId] + share);
                }
            });
        }
        // 1.2. لست الدافع ولكنك مشارك (أنت مدين للآخرين) -> الرصيد سالب
        else if (expense.participants_ids.includes(currentUserID)) {
            if(netBalances[payerId] !== undefined) {
                // زيادة الدين عليك لهذا الشخص
                netBalances[payerId] = roundToTwo(netBalances[payerId] - share);
            }
        }
    });

    // ----------------------------------------------------
    // ✨ التعديل الحاسم: تطبيق تأثير التسويات على الأرصدة الصافية
    // ----------------------------------------------------
    allSettlements.forEach(settlement => {
        const { payer_id, recipient_id, amount } = settlement;
        
        // حالة 1: أنت الدافع (أنت من سدد الدين)
        // هذا يعني أن الدين الذي عليك تجاه recipient_id قد نقص
        if (payer_id === currentUserID && netBalances[recipient_id] !== undefined) {
            // إضافة المبلغ المدفوع على الرصيد الصافي. 
            // إذا كان الرصيد الصافي سالباً (دين عليك)، فستزيد قيمته نحو الصفر.
            netBalances[recipient_id] = roundToTwo(netBalances[recipient_id] + amount);
        } 
        
        // حالة 2: أنت المستلم (شخص سدد لك دين عليه)
        // هذا يعني أن المستحقات التي لك على payer_id قد نقصت
        else if (recipient_id === currentUserID && netBalances[payer_id] !== undefined) {
            // طرح المبلغ المستلم من الرصيد الصافي.
            // إذا كان الرصيد الصافي موجباً (مستحق لك)، فستنقص قيمته نحو الصفر.
            netBalances[payer_id] = roundToTwo(netBalances[payer_id] - amount);
        }
    });
}

function updateSummaryDisplay() {
    const totalDebtEl = document.getElementById('totalDebt');
    const totalCreditEl = document.getElementById('totalCredit');
    const debtContainer = document.getElementById('debtContainer');
    const claimList = document.getElementById('claimList');
    const noDebtsEl = document.getElementById('noDebts');

    if (!totalDebtEl || !totalCreditEl || !debtContainer || !claimList) return;

    let totalDebt = 0; 
    let totalCredit = 0; 
    let hasDebtItems = false;
    let hasClaimItems = false;

    debtContainer.innerHTML = '';
    claimList.innerHTML = '<p class="text-center text-gray-400 py-4">جاري تحميل المستحقات...</p>'; // مؤقت

    Object.keys(netBalances).forEach(otherUID => {
        const netAmount = netBalances[otherUID];
        const otherUserName = getUserNameById(otherUID);

        if (Math.abs(netAmount) < 0.1) return;

        if (netAmount < 0) {
            // أنت مدين (Debt)
            const amount = Math.abs(netAmount);
            totalDebt += amount;
            hasDebtItems = true;
            
            const debtHTML = `
                <div class="balance-card" data-user-id="${otherUID}" data-amount="${amount}" data-user-name="${otherUserName}">
                    <div class="balance-info">
                        <span class="balance-name">${otherUserName}</span>
                        <span class="balance-status">يدين لك ${amount.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 2})} SDG</span>
                    </div>
                    <button class="action-button" onclick="showSettleModal('${otherUserName}', ${amount}, '${otherUID}')">تسوية المبلغ</button>
                </div>
            `;
            debtContainer.innerHTML += debtHTML;

        } else if (netAmount > 0) {
            // أنت دائن (Credit)
            const amount = netAmount;
            totalCredit += amount;
            hasClaimItems = true;

            const claimHTML = `
                <div class="claim-item" data-user="${otherUserName}" data-amount="${amount}" data-user-id="${otherUID}">
                    <span class="font-semibold text-gray-800">${otherUserName}: </span>
                    <div class="flex items-center space-x-2 space-x-reverse">
                         <span class="text-green-600 font-bold dir-ltr">${amount.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 2})} SDG</span>
                         <button class="nudge-button-individual" onclick="nudgeUser('${otherUserName}', '${otherUID}')">نكز</button>
                    </div>
                </div>
            `;
            // لا نضيفها مباشرة، سنقوم بإفراغ القائمة لاحقاً
        }
    });

    // تحديث البطاقات العلوية
    totalDebtEl.innerHTML = `${roundToTwo(totalDebt).toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;
    totalCreditEl.innerHTML = `${roundToTwo(totalCredit).toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;

    // تحديث قائمة الديون (التي عليك)
    if (noDebtsEl) {
        if (!hasDebtItems) {
            noDebtsEl.classList.remove('hidden');
            debtContainer.innerHTML = '';
        } else {
            noDebtsEl.classList.add('hidden');
        }
    }
    
    // تحديث قائمة المطالبات (لك على الآخرين)
    if (hasClaimItems) {
        claimList.innerHTML = '';
        // إعادة إنشاء القائمة بعد إفراغها (لضمان الترتيب)
        Object.keys(netBalances).filter(uid => netBalances[uid] > 0.1).forEach(otherUID => {
            const amount = netBalances[otherUID];
            const otherUserName = getUserNameById(otherUID);
            const claimHTML = `
                <div class="claim-item" data-user="${otherUserName}" data-amount="${amount}" data-user-id="${otherUID}">
                    <span class="font-semibold text-gray-800">${otherUserName}: </span>
                    <div class="flex items-center space-x-2 space-x-reverse">
                         <span class="text-green-600 font-bold dir-ltr">${amount.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 2})} SDG</span>
                         <button class="nudge-button-individual" onclick="nudgeUser('${otherUserName}', '${otherUID}')">نكز</button>
                    </div>
                </div>
            `;
            claimList.innerHTML += claimHTML;
        });
        const claimButton = document.querySelector('#claimModal .btn-submit');
        if (claimButton) claimButton.disabled = false;
    } else {
        claimList.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد مستحقات مالية من الآخرين حالياً.</p>';
        const claimButton = document.querySelector('#claimModal .btn-submit');
        if (claimButton) claimButton.disabled = true;
    }
}


// ============================================================
// 🔔 منطق الإشعارات (Notifications Logic)
// ============================================================
function loadNotifications() {
    if (!currentUserID || !db) return;

    onValue(ref(db, 'notifications'), (snapshot) => { 
        if (snapshot.exists()) {
            const val = snapshot.val();
            // تجميع الإشعارات وتصفيتها للمستخدم الحالي فقط
            userNotifications = Object.keys(val)
                .map(key => ({ id: key, ...val[key] }))
                .filter(n => n.uid === currentUserID)
                .sort((a, b) => b.timestamp - a.timestamp);
            
            displayNotifications();
        } else {
            userNotifications = [];
            displayNotifications();
        }
    });
}

function displayNotifications() {
    const listContainer = document.getElementById('notificationsList');
    const badge = document.getElementById('notificationBadge');

    if (!listContainer || !badge) return;

    const unreadCount = userNotifications.filter(n => !n.is_read).length;

    badge.textContent = unreadCount.toString(); 
    if (unreadCount > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    listContainer.innerHTML = '';
    if (userNotifications.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد إشعارات حالياً.</p>';
        return;
    }

    userNotifications.slice(0, 10).forEach(notification => {
        const statusClass = notification.is_read ? 'text-gray-500 bg-gray-50' : 'font-semibold bg-blue-50 hover:bg-blue-100';
        let icon = 'fa-info-circle text-blue-500';

        if (notification.type === 'settlement_received') { icon = 'fa-receipt text-green-500'; }
        else if (notification.type === 'nudge') { icon = 'fa-bell-slash text-yellow-500'; }
        else if (notification.type === 'debit') { icon = 'fa-minus-circle text-red-500'; }

        const { date, time } = formatBankDate(notification.timestamp);

        const notifHTML = `
            <div class="p-3 rounded-lg border cursor-pointer transition ${statusClass}" data-id="${notification.id}" onclick="markNotificationAsRead('${notification.id}')">
                <p><i class="fas ${icon} ml-1"></i> ${notification.message}</p>
                <p class="text-xs mt-1 text-gray-400">
                    <i class="far fa-clock ml-1"></i> ${time} - ${date}
                </p>
            </div>
        `;
        listContainer.innerHTML += notifHTML;
    });
}

window.markNotificationAsRead = async function(notificationId) {
    if(!db) return;
    const notificationRef = ref(db, `notifications/${notificationId}`);
    try {
        await update(notificationRef, { is_read: true });
    } catch(e) {
        console.error("Error marking notification as read:", e);
    }
};


// ============================================================
// 💾 منطق الحفظ (Save Expense) - (مختصر للعرض، المنطق الكامل موجود بالفعل)
// ============================================================
// ... (دوال saveExpense, handleSaveClick, previewExpense موجودة بالفعل) ...
window.hideModal = () => {
    document.getElementById('previewModal').classList.remove('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';
};

window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');


// ============================================================
// 🔄 تحميل البيانات (Load Data)
// ============================================================
function loadData() {
    if (!currentUserID || !db) return;

    // جلب المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            updateHomeDisplay();
            // updateHistoryHeader(); // إذا كانت في صفحة السجل
            populateParticipants();
        }
    });

    // جلب المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);
            
            if (window.location.href.includes('summary.html')) {
                // defer calculation until settlements are loaded
                if (allSettlements.length > 0) {
                    calculateNetBalances();
                    updateSummaryDisplay(); 
                }
            }
            if (window.location.href.includes('history.html')) {
                // displayHistory(); // إذا كانت في صفحة السجل
            }
            if (window.location.href.includes('my_expenses.html')) {
                displayPersonalExpenses();
            }
        } else {
            allExpenses = [];
        }
    });
    
    // ✨ جديد: جلب التسويات
    onValue(ref(db, 'settlements'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allSettlements = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] }));
        } else {
            allSettlements = [];
        }
        // تحديث ملخص الأرصدة بعد التأكد من تحميل التسويات
        if (window.location.href.includes('summary.html')) {
            calculateNetBalances(); 
            updateSummaryDisplay(); 
        }
    });

    // جلب الإشعارات
    loadNotifications();
}

// ============================================================
// 🔐 المصادقة والبداية (Entry Point)
// ============================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;

        const sidebarName = document.getElementById('sidebarUserName');
        const sidebarEmail = document.getElementById('sidebarUserEmail');
        if (sidebarName) sidebarName.textContent = user.displayName || 'مستخدم';
        if (sidebarEmail) sidebarEmail.textContent = user.email || '';

        loadData();

        const logoutSidebarBtn = document.getElementById('logoutSidebarButton');
        if (logoutSidebarBtn) logoutSidebarBtn.onclick = () => auth.signOut().then(() => window.location.href = 'auth.html');

    } else {
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});

// ============================================================
// 🔥 دوال التسوية والمطالبة (Final Logic) 🔥
// ============================================================

// 🔥 دالة إرسال النكز (المطالبة)
window.nudgeUser = async function(user, uid) {
    if(!db || !currentUserID) return;
    const notificationTime = Date.now();
    const newNotifKey = push(ref(db, 'notifications')).key;
    
    const notificationData = {
        uid: uid, // UID الخاص بالشخص المدين لك
        message: `${getUserNameById(currentUserID)} يطالبك بتسوية ديونك معه. يرجى مراجعة صفحة التسوية.`,
        timestamp: notificationTime,
        is_read: false,
        type: 'nudge',
    };

    try {
        await update(ref(db), { [`notifications/${newNotifKey}`]: notificationData });
        alert(`تم إرسال نكز تذكير لـ ${user} للمطالبة بمستحقاتك!`);
    } catch(e) {
        console.error("Error sending nudge notification:", e);
        alert(`حدث خطأ أثناء إرسال النكز لـ ${user}.`);
    }
}

// 🔥 دالة التسوية الفعلية (تعديل الأرصدة)
window.sendSettleTransaction = async function(recipientUID, amount, opNumber) {
    if (!currentUserID || !recipientUID || amount <= 0 || !db) {
        alert("خطأ في بيانات التسوية أو عدم اتصال بقاعدة البيانات.");
        return false;
    }

    const updates = {};
    const payerName = getUserNameById(currentUserID);
    
    const currentPayerUser = allUsers.find(u => u.uid === currentUserID);
    const recipientUser = allUsers.find(u => u.uid === recipientUID);

    if (!currentPayerUser || !recipientUser) {
        alert("خطأ: لم يتم العثور على بيانات أحد المستخدمين.");
        return false;
    }

    // 1. تحديث رصيد الدافع (أنت): يزيد رصيدك لتغطية الدين السلبي
    const newCurrentUserBalance = roundToTwo(currentPayerUser.balance + amount);
    updates[`users/${currentUserID}/balance`] = newCurrentUserBalance;

    // 2. تحديث رصيد المستلم: ينقص رصيده لتصفير المطالبة عليه
    const newRecipientBalance = roundToTwo(recipientUser.balance - amount);
    updates[`users/${recipientUID}/balance`] = newRecipientBalance;

    // 3. إضافة سجل للتسوية
    const newSettleKey = push(ref(db, 'settlements')).key;
    updates[`settlements/${newSettleKey}`] = {
        payer_id: currentUserID, 
        recipient_id: recipientUID, 
        amount: amount,
        operation_number: opNumber.slice(-4),
        timestamp: Date.now()
    };
    
    // 4. إشعار للمستلم
    const notificationTime = Date.now();
    const newNotifKey = push(ref(db, 'notifications')).key;

    updates[`notifications/${newNotifKey}`] = {
        uid: recipientUID,
        message: `${payerName} قام بتسوية دين بمبلغ ${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG لك.`,
        timestamp: notificationTime,
        is_read: false,
        type: 'settlement_received',
        settlement_id: newSettleKey
    };

    try {
        await update(ref(db), updates);
        
        // تحديث الكائنات المحلية
        currentPayerUser.balance = newCurrentUserBalance;
        recipientUser.balance = newRecipientBalance;
        currentUserDB = currentPayerUser; 
        
        return true;
    } catch (e) {
        console.error("Error performing settlement:", e);
        alert('خطأ في الاتصال بقاعدة البيانات أثناء التسوية.');
        return false;
    }
};

window.showSettleModal = function(user, amount, uid) {
    // ... (منطق عرض المودال) ...
    currentSettleUser = user;
    currentSettleMaxAmount = amount;
    currentSettleRecipientUID = uid;
    
    let relationText = `تسوية الدين المستحق لـ ${user}`;

    document.getElementById('settleRelation').textContent = relationText;
    document.getElementById('maxSettleAmountDisplay').textContent = amount.toLocaleString(undefined, {minimumFractionDigits: 2});
    
    const settleAmountInput = document.getElementById('settleAmount');
    settleAmountInput.setAttribute('max', amount);
    settleAmountInput.value = amount; 
    
    document.getElementById('settleModal').classList.add('show');
    settleAmountInput.dispatchEvent(new Event('input')); 
}

window.hideSettleModal = function() {
    // ... (منطق إخفاء المودال) ...
    document.getElementById('settleModal').classList.remove('show');
    const settleForm = document.getElementById('settleForm');
    if(settleForm) settleForm.reset();
    const remainingEl = document.getElementById('remainingBalance');
    if(remainingEl) remainingEl.classList.add('hidden');
    currentSettleUser = '';
    currentSettleMaxAmount = 0;
    currentSettleRecipientUID = ''; 
}

document.getElementById('settleForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const operationNumber = document.getElementById('operationNumber').value;
    const amount = parseFloat(document.getElementById('settleAmount').value);
    
    if (operationNumber.length < 4 || isNaN(parseInt(operationNumber.slice(-4)))) {
        alert("يرجى إدخال رقم عملية مكون من 4 أرقام على الأقل.");
        return;
    }

    if (amount <= 0 || amount > currentSettleMaxAmount || !currentSettleRecipientUID) {
        alert(`المبلغ المدفوع يجب أن يكون صحيحاً والطرف الآخر محدداً. المبلغ الأقصى: ${currentSettleMaxAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}`);
        return;
    }
    
    const opNumLastFour = operationNumber.slice(-4); 

    const success = await sendSettleTransaction(currentSettleRecipientUID, amount, opNumLastFour);
    
    if (success) {
        alert(`تم تأكيد دفع ${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG لـ ${currentSettleUser}.`);
        hideSettleModal();
        // التحديث التلقائي سيحدث بفضل onValue listener الذي أضفناه للتسويات والمصروفات
    }
});

// ... (باقي الدوال غير المتعلقة بالFirebase أو التحديث) ...