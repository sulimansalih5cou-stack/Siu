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
let userNotifications = [];
let allSettlements = [];
let netBalances = {};

// 🔥 متغيرات خاصة بسجل العمليات (History)
let itemsPerPage = 10;
let currentPage = 1;
let activeFilter = '30days';
let filteredHistory = []; 
let isLoadingHistory = false; 

// 🔥 متغيرات خاصة بالإشعارات (Notifications) 
let notificationsPerPage = 10;
let currentNotificationPage = 1;
let isLoadingNotifications = false; 
// نهاية المتغيرات الجديدة

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

    // 🌟 تعديل #1 🌟: استخدام اسم المستخدم من Auth إذا لم يكن موجودًا في DB بعد
    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;
    else if (auth.currentUser && auth.currentUser.email) displayName = auth.currentUser.email.split('@')[0]; // fallback

    if (nameEl) nameEl.textContent = displayName;

    // تحديث بيانات الهيدر في history.html
    const displayHeaderName = document.getElementById('displayHeaderName');
    const displayHeaderEmail = document.getElementById('displayHeaderEmail');
    if (displayHeaderName) displayHeaderName.textContent = displayName;
    if (displayHeaderEmail && auth.currentUser) displayHeaderEmail.textContent = auth.currentUser.email || '';

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

    // 🌟 تعديل #4 🌟: تحديث منطق المشاركين بعد تحديث بيانات المستخدم
    if (window.location.href.includes('index.html')) {
         populateParticipants();
    }
}

// 🌟 تعديل #4 🌟: دالة لتعبئة قائمة المشاركين بضم المستخدم الحالي كخيار افتراضي
function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    const isMessengerCheckbox = document.getElementById('isMessenger');
    if (!container || !isMessengerCheckbox) return;

    container.innerHTML = '';
    if (!currentUserID) return;
    
    // 1. إضافة المستخدم الحالي كخيار افتراضي ومحدد
    const currentUserDiv = document.createElement('div');
    currentUserDiv.className = 'checkbox-item bg-blue-100 border-blue-400';
    currentUserDiv.innerHTML = `
        <label class="flex items-center w-full cursor-pointer">
            <input type="checkbox" data-uid="${currentUserID}" class="form-checkbox h-5 w-5 text-blue-600" checked disabled>
            <span class="mr-2 font-bold text-blue-800 select-none">${getUserNameById(currentUserID)} (أنا)</span>
        </label>
    `;
    container.appendChild(currentUserDiv);

    // 2. إضافة باقي المستخدمين
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

    // 3. ربط حدث تغيير حالة مربع "المرسال"
    isMessengerCheckbox.onchange = function() {
        // إذا كان المرسال محدداً، لا يمكنك تحديد نفسك كمشارك في التقسيم
        const selfCheckbox = container.querySelector(`input[data-uid="${currentUserID}"]`);
        
        if (this.checked) {
             // تعطيل اختيار الذات إذا كان مرسالًا (لأن share = 0)
            if (selfCheckbox) selfCheckbox.checked = false;
        } else {
            // إعادة تحديد الذات تلقائياً إذا ألغى خيار المرسال
            if (selfCheckbox) selfCheckbox.checked = true;
        }
    };
    
    // تحديث حالة مربع المرسال عند التحميل لأول مرة
    if (isMessengerCheckbox.checked) {
        const selfCheckbox = container.querySelector(`input[data-uid="${currentUserID}"]`);
        if (selfCheckbox) selfCheckbox.checked = false;
    }
}

window.selectAllParticipants = function() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => {
        // لا تغير حالة المستخدم الحالي إذا كان معطلاً
        if (!cb.disabled) {
            cb.checked = true;
        }
    });

    // 🌟 تعديل #4 🌟: تعطيل مربع المرسال إذا تم تحديد الكل (لأن الدافع هو بالضرورة مشارك الآن)
    const isMessengerCheckbox = document.getElementById('isMessenger');
    if (isMessengerCheckbox) {
        isMessengerCheckbox.checked = false;
        const selfCheckbox = document.querySelector(`#participantsCheckboxes input[data-uid="${currentUserID}"]`);
        if (selfCheckbox) selfCheckbox.checked = true;
    }
};

// ============================================================
// 💾 منطق حفظ المصروفات (لصفحة index.html) 🔥 
// ============================================================

/**
 * دالة مساعدة لحساب حصة كل مشارك
 * @param {number} amount - المبلغ الكلي للمصروف
 * @param {number} participantsCount - عدد المشاركين
 * @returns {number} حصة كل مشارك مقربة لرقمين عشريين
 */
function calculateShare(amount, participantsCount) {
    if (participantsCount === 0) return 0;
    return roundToTwo(amount / participantsCount);
}

// 🔥 الدالة الرئيسية للمعاينة
window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value.trim();
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const isMessenger = document.getElementById('isMessenger').checked;
    
    // 🌟 تعديل #4 🌟: جمع كل المشاركين المحددين (الدافع مضمن أو محدد يدوياً)
    const allCheckboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    let selectedParticipantsUids = Array.from(allCheckboxes)
        .filter(cb => cb.checked && !cb.disabled)
        .map(cb => cb.dataset.uid);

    // إذا لم يتم تحديد المرسال، فإن المستخدم الحالي (الدافع) هو مشارك في التقسيم
    if (!isMessenger) {
        selectedParticipantsUids.push(currentUserID);
    }
    
    // إزالة التكرارات وضمان وجود الدافع
    selectedParticipantsUids = [...new Set(selectedParticipantsUids)];

    // التحقق من الإدخال
    if (!title || isNaN(amount) || amount <= 0 || selectedParticipantsUids.length === 0) {
        alert("يرجى إدخال اسم المصروف والمبلغ، وتحديد مشارك واحد على الأقل.");
        return;
    }

    // حساب الحصة
    const participantsCount = selectedParticipantsUids.length;
    const finalShare = calculateShare(amount, participantsCount);

    // النص الذي سيعرض في المعاينة
    const participantsNames = selectedParticipantsUids.map(uid => getUserNameById(uid)).join('، ');

    let previewHTML = `
        <p><strong>اسم المصروف:</strong> ${title}</p>
        <p><strong>المبلغ الكلي:</strong> ${amount.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG</p>
        <p><strong>الدافع:</strong> ${getUserNameById(currentUserID)}</p>
        <p><strong>المشاركون في التقسيم:</strong> ${participantsNames}</p>
        <p><strong>حصة كل شخص:</strong> ${finalShare.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG</p>
        <p class="mt-4 font-bold text-lg text-blue-600">
            ${isMessenger ? '🔥' : '💰'} حصتك الشخصية ستكون: ${isMessenger ? '0.00' : finalShare.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG
        </p>
    `;

    document.getElementById('previewText').innerHTML = previewHTML;

    // تخزين البيانات مؤقتاً قبل الحفظ
    window.tempExpenseData = {
        title: title,
        amount: amount,
        share: finalShare,
        participants: selectedParticipantsUids, // قائمة المشاركين الذين سيخصم منهم
        isMessenger: isMessenger
    };

    // عرض المودال
    document.getElementById('previewModal').classList.add('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';

    // إخفاء تحذير التكرار مؤقتاً
    document.getElementById('warning').style.display = 'none';
};

// 🔥 دالة التعامل مع زر الحفظ
window.handleSaveClick = function() {
    if (!window.tempExpenseData) return;

    if (window.tempExpenseData.isMessenger) {
        // إذا كان مرسالاً، اعرض التنبيه الخاص بالمرسال
        document.getElementById('previewDetails').style.display = 'none';
        document.getElementById('messengerConfirmation').style.display = 'block';

        // تحديث نص المبلغ في تنبيه المرسال
        const messengerWarningP = document.querySelector('#messengerConfirmation .messenger-warning p');
        if(messengerWarningP) messengerWarningP.innerHTML = messengerWarningP.innerHTML.replace('سيظهر هنا', window.tempExpenseData.amount.toLocaleString('en-US', {minimumFractionDigits: 2}) + ' SDG');
    } else {
        // إذا لم يكن مرسالاً، قم بالحفظ مباشرة
        window.saveExpense();
    }
};

// 🔥 الدالة النهائية لحفظ المصروف وتحديث الأرصدة
window.saveExpense = async function() {
    const data = window.tempExpenseData;
    if (!data || !currentUserID || !db) return;

    const expenseRecord = {
        title: data.title,
        total_amount: data.amount,
        share: data.share,
        payer_id: currentUserID,
        participants_ids: data.participants,
        is_messenger: data.isMessenger,
        timestamp: Date.now()
    };

    try {
        const updates = {};

        // 1. تحديث رصيد الدافع
        let payerContribution;
        if (data.isMessenger) {
            // الدافع ليس مشاركاً، يدفع المبلغ كاملاً نيابة عن الآخرين.
            payerContribution = data.amount;
        } else {
            // الدافع مشارك، يدفع نيابة عن الآخرين = المبلغ الكلي - حصته
            payerContribution = roundToTwo(data.amount - data.share);
        }

        // تحديث رصيد الدافع في قاعدة البيانات (يزيد بمقدار المبلغ المستحق له من الآخرين)
        const oldBalance = currentUserDB.balance || 0;
        const newBalance = roundToTwo(oldBalance + payerContribution);
        updates[`users/${currentUserID}/balance`] = newBalance;
        currentUserDB.balance = newBalance; // تحديث الكائن المحلي

        // 2. تحديث أرصدة المشاركين (غير الدافع)
        const participantsToDebit = data.participants.filter(uid => uid !== currentUserID);
        participantsToDebit.forEach(uid => {
            const user = allUsers.find(u => u.uid === uid);
            if (user) {
                // رصيد المشارك ينقص (يدخل في السالب) بمقدار حصته
                const newParticipantBalance = roundToTwo(user.balance - data.share);
                updates[`users/${uid}/balance`] = newParticipantBalance;
                user.balance = newParticipantBalance; // تحديث الكائن المحلي

                // إضافة إشعار للمشارك بالدين الجديد
                const newNotifKey = push(ref(db, 'notifications')).key;
                updates[`notifications/${newNotifKey}`] = {
                    uid: uid,
                    message: `دين جديد: ${data.title}. مطلوب منك ${data.share.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG لـ ${getUserNameById(currentUserID)}.`,
                    timestamp: Date.now(),
                    is_read: false,
                    type: 'debit',
                };
            }
        });

        // 3. إضافة المصروف نفسه
        const newExpenseKey = push(ref(db, 'expenses')).key;
        updates[`expenses/${newExpenseKey}`] = expenseRecord;

        // تنفيذ جميع التحديثات مرة واحدة (Atomic update)
        await update(ref(db), updates);

        // إخفاء مودال المعاينة وعرض مودال النجاح
        window.hideModal();
        document.getElementById('successModal').classList.add('show');

        // إعادة تعيين النموذج
        document.getElementById('expenseForm').reset();
        window.tempExpenseData = null;
        populateParticipants(); // إعادة تعبئة المشاركين

    } catch (e) {
        console.error("Error saving expense and updating balances:", e);
        alert("حدث خطأ أثناء حفظ المصروف. الرجاء المحاولة مرة أخرى.");
    }
};

// ============================================================
// 📊 منطق المصروفات الشخصية (My Expenses Logic)
// ============================================================

// 🌟 تعديل #5 🌟: إعادة هيكلة لعرض الديون والمستحقات (الصافي) مع كل مستخدم
function displayPersonalExpenses() {
    const container = document.getElementById('personalExpensesContainer');
    const noExpensesEl = document.getElementById('noPersonalExpenses');
    const totalExpensesEl = document.getElementById('totalPersonalExpenses');

    if (!container) return;
    container.innerHTML = '';

    let totalNetDebt = 0;
    let netBalancesForDisplay = {};

    // 1. حساب الأرصدة الصافية مع كل شخص (نفس منطق calculateNetBalances ولكن لا نأخذ في الاعتبار التسويات هنا)
    allExpenses.forEach(expense => {
        const payerId = expense.payer_id;
        const share = expense.share;
        
        // أ. أنت الدافع (لك فلوس)
        if (payerId === currentUserID) {
            const participantsToCheck = expense.participants_ids.filter(id => id !== currentUserID);
            const amountClaimed = (expense.is_messenger || false) ? expense.total_amount : (participantsToCheck.length * share);
            
            participantsToCheck.forEach(participantId => {
                const amount = expense.share; 
                if (!netBalancesForDisplay[participantId]) netBalancesForDisplay[participantId] = 0;
                netBalancesForDisplay[participantId] = roundToTwo(netBalancesForDisplay[participantId] + amount); // إيجابي: هذا المبلغ لك
            });
        }
        // ب. لست الدافع ولكنك مشارك (عليك فلوس)
        else if (expense.participants_ids.includes(currentUserID)) {
            if (!netBalancesForDisplay[payerId]) netBalancesForDisplay[payerId] = 0;
            netBalancesForDisplay[payerId] = roundToTwo(netBalancesForDisplay[payerId] - share); // سلبي: هذا المبلغ عليك
        }
    });

    // 2. تطبيق تأثير التسويات على هذه الأرصدة لتمثيل الوضع الحالي
    allSettlements.forEach(settlement => {
        const { payer_id, recipient_id, amount } = settlement;

        // حالة 1: أنت الدافع في التسوية (تدفع دينك) -> يزيد رصيدك الصافي
        if (payer_id === currentUserID && netBalancesForDisplay[recipient_id] !== undefined) {
            netBalancesForDisplay[recipient_id] = roundToTwo(netBalancesForDisplay[recipient_id] + amount);
        }

        // حالة 2: أنت المستلم في التسوية (تستلم دينك) -> ينقص رصيدك الصافي
        else if (recipient_id === currentUserID && netBalancesForDisplay[payer_id] !== undefined) {
            netBalancesForDisplay[payer_id] = roundToTwo(netBalancesForDisplay[payer_id] - amount);
        }
    });

    // 3. عرض النتائج في القائمة
    const nonZeroBalances = Object.keys(netBalancesForDisplay).filter(uid => Math.abs(netBalancesForDisplay[uid]) > 0.1);
    
    if (nonZeroBalances.length === 0) {
        if(noExpensesEl) noExpensesEl.classList.remove('hidden');
        if(totalExpensesEl) totalExpensesEl.textContent = '0.00';
        return;
    }
    if(noExpensesEl) noExpensesEl.classList.add('hidden');

    nonZeroBalances.forEach(otherUID => {
        const netAmount = netBalancesForDisplay[otherUID];
        const otherUserName = getUserNameById(otherUID);
        const amountDisplay = Math.abs(netAmount).toLocaleString('en-US', {minimumFractionDigits: 2});

        let iconClass, amountClass, transactionTitle, mainTitle, iconFa;

        if (netAmount < -0.1) {
            // دين عليك (You owe)
            totalNetDebt += Math.abs(netAmount);
            iconClass = 'icon-danger';
            amountClass = 'amount-neg';
            iconFa = 'fa-minus-circle';
            transactionTitle = `دين صافي عليك لـ ${otherUserName}`;
            mainTitle = 'يجب سداد هذا المبلغ لتسوية الأرصدة.';
            
            cardHTML = `
                <div class="bankak-card">
                    <div class="card-main-content">
                        <div class="details-wrapper">
                            <div class="bank-icon-container ${iconClass} ml-3">
                                <i class="fas ${iconFa}"></i>
                            </div>
                            <div class="details-text text-right">
                                <p class="transaction-title text-red-700">${transactionTitle}</p>
                                <p class="transaction-sub"> ${mainTitle} </p>
                            </div>
                        </div>
                        <div class="amount-display ${amountClass}">
                            - ${amountDisplay} <span class="text-sm font-normal">SDG</span>
                        </div>
                    </div>
                    <div class="card-footer-date">
                        <span><i class="fas fa-handshake ml-1"></i> صافي حساب</span>
                        <span><button class="text-blue-500 hover:text-blue-700 font-bold" onclick="window.location.href='summary.html'">سدد الآن</button></span>
                    </div>
                </div>
            `;
        } else if (netAmount > 0.1) {
             // مستحق لك (They owe you)
            iconClass = 'icon-success';
            amountClass = 'amount-pos';
            iconFa = 'fa-plus-circle';
            transactionTitle = `مستحق لك من ${otherUserName}`;
            mainTitle = 'هذا المبلغ يجب أن يسدد لك.';

            cardHTML = `
                <div class="bankak-card">
                    <div class="card-main-content">
                        <div class="details-wrapper">
                            <div class="bank-icon-container ${iconClass} ml-3">
                                <i class="fas ${iconFa}"></i>
                            </div>
                            <div class="details-text text-right">
                                <p class="transaction-title text-green-700">${transactionTitle}</p>
                                <p class="transaction-sub"> ${mainTitle} </p>
                            </div>
                        </div>
                        <div class="amount-display ${amountClass}">
                            + ${amountDisplay} <span class="text-sm font-normal">SDG</span>
                        </div>
                    </div>
                    <div class="card-footer-date">
                        <span><i class="fas fa-handshake ml-1"></i> صافي حساب</span>
                        <span><button class="text-yellow-500 hover:text-yellow-700 font-bold" onclick="nudgeUser('${otherUserName}', '${otherUID}')">نكز للمطالبة</button></span>
                    </div>
                </div>
            `;
        } else {
            return;
        }

        container.innerHTML += cardHTML;
    });

    if (totalExpensesEl) {
        totalExpensesEl.textContent = roundToTwo(totalNetDebt).toLocaleString('en-US', {minimumFractionDigits: 2});
    }
}


// ============================================================
// 💰 منطق ملخص التسوية (Settlement Summary Logic)
// ============================================================

// ... (دالة calculateNetBalances لم تتغير، تبقى كما هي) ...

// 🌟 تعديل #2 🌟: إضافة دالة النكز
window.nudgeUser = async function(userName, targetUID) {
    if (!db || !currentUserID || !targetUID) return;

    const notifRef = ref(db, 'notifications');
    const newNotifKey = push(notifRef).key;
    const currentUserName = getUserNameById(currentUserID);

    const notificationData = {
        uid: targetUID,
        message: `${currentUserName} يطالبك بتسوية الرصيد المستحق عليه.`,
        timestamp: Date.now(),
        is_read: false,
        type: 'nudge',
        sender_id: currentUserID
    };

    try {
        await update(ref(db, `notifications/${newNotifKey}`), notificationData);
        alert(`تم إرسال إشعار نكز لـ ${userName}.`);
    } catch (e) {
        console.error("Error sending nudge notification:", e);
        alert('حدث خطأ أثناء إرسال إشعار النكز.');
    }
};

// ... (دالة updateSummaryDisplay لم تتغير، تبقى كما هي) ...

// ============================================================
// 🔥 منطق سجل العمليات (History Logic) - تم تحديثه
// ============================================================

// ... (دالة combineAndSortHistory لم تتغير، تبقى كما هي) ...

// ... (دالة filterHistory لم تتغير، تبقى كما هي) ...

/**
 * الدالة الرئيسية لعرض سجل العمليات (Infinite Scrolling)
 * 🌟 تعديل #3 🌟: إضافة تفاصيل المصروف داخل البطاقة
 */
function displayHistory(isAppending = false) {
    const container = document.getElementById('expensesContainer');

    if (!container || isLoadingHistory) return;

    isLoadingHistory = true;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = currentPage * itemsPerPage;
    const recordsToShow = filteredHistory.slice(startIndex, endIndex);

    if (currentPage === 1 && !isAppending) {
        container.innerHTML = '';
    }

    if (recordsToShow.length === 0 && currentPage === 1) {
        container.innerHTML = `
            <p class="text-center text-gray-500 mt-12 py-10 border rounded-lg bg-white shadow-sm">
                <i class="fas fa-file-invoice-dollar fa-3x mb-4 text-red-500"></i><br>
                لا توجد سجلات معاملات مطابقة للفلتر الحالي.
            </p>
        `;
        isLoadingHistory = false;
        return;
    }
    
    // عرض مؤشر التحميل المؤقت
    const loadingIndicator = document.getElementById('historyLoadingIndicator');
    if (loadingIndicator && isAppending) {
        loadingIndicator.classList.remove('hidden');
    }

    recordsToShow.forEach(record => {
        let cardHTML = '';
        const { date, time } = formatBankDate(record.timestamp);

        if (record.type === 'expense') {
            const isPayer = record.payer_id === currentUserID;
            const payerName = getUserNameById(record.payer_id);
            const share = record.share || 0;
            const participantsNames = record.participants_ids.map(uid => uid === currentUserID ? `${getUserNameById(uid)} (أنا)` : getUserNameById(uid)).join('، ');

            let iconClass = 'icon-danger';
            let amountClass = 'amount-neg';
            let amountText = '0.00';
            let mainTitle = `تفاصيل المصروف: ${record.title}`;
            let subTitle = `الدافع: ${payerName}`;
            let iconBadge = 'fa-arrow-down text-red-500';

            // 🌟 التفاصيل الجديدة 🌟
            let detailedInfo = `
                <div class="transaction-details text-xs pt-2 mt-2 border-t border-gray-100 text-gray-500">
                    <p><i class="fas fa-users ml-1"></i> المشاركون: ${participantsNames}</p>
                    <p><i class="fas fa-calculator ml-1"></i> حصة الفرد: ${share.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</p>
                    <p><i class="fas fa-money-bill-wave ml-1"></i> المبلغ الكلي: ${record.total_amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</p>
                </div>
            `;
            // 🌟 نهاية التفاصيل الجديدة 🌟

            if (isPayer) {
                const amountClaimed = (record.is_messenger || false) ? record.total_amount : roundToTwo(record.total_amount - share);
                if (amountClaimed > 0.1) {
                    amountText = `+ ${amountClaimed.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                    iconClass = 'icon-success';
                    amountClass = 'amount-pos';
                    mainTitle = (record.is_messenger || false) ? `دفعة لك (كمرسال) عن: ${record.title}` : `دفعة لك من مشاركين في: ${record.title}`;
                    iconBadge = 'fa-arrow-up text-green-500';
                    subTitle = `الدافع: أنت`;
                } else {
                    return;
                }
            } else {
                if (share > 0.1) {
                    amountText = `- ${share.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                    mainTitle = `دين عليك لـ ${payerName} في: ${record.title}`;
                } else {
                    return;
                }
            }

            cardHTML = `
                <div class="bankak-card">
                    <div class="card-main-content">
                        <div class="details-wrapper">
                            <div class="bank-icon-container ${iconClass} ml-3">
                                <i class="fas fa-file-invoice-dollar"></i>
                                <span class="arrow-badge"><i class="fas ${iconBadge}"></i></span>
                            </div>
                            <div class="details-text text-right">
                                <p class="transaction-title">${mainTitle}</p>
                                <p class="transaction-sub">${subTitle}</p>
                            </div>
                        </div>
                        <div class="amount-display ${amountClass}">
                            ${amountText} <span class="text-sm font-normal">SDG</span>
                        </div>
                    </div>
                    ${detailedInfo} <div class="card-footer-date">
                        <span><i class="far fa-calendar-alt ml-1"></i> ${date}</span>
                        <span><i class="far fa-clock ml-1"></i> ${time}</span>
                    </div>
                </div>
            `;
        } else if (record.type === 'settlement') {
            // ... (منطق التسوية لا يتغير)
            const isPayer = record.payer_id === currentUserID;
            const otherUserName = isPayer ? getUserNameById(record.recipient_id) : getUserNameById(record.payer_id);
            const iconClass = isPayer ? 'icon-danger' : 'icon-success';
            const amountClass = isPayer ? 'amount-neg' : 'amount-pos';
            const amountText = isPayer ? `- ${record.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}` : `+ ${record.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            const mainTitle = isPayer ? `تسوية دين دفعتها لـ ${otherUserName}` : `تسوية دين تلقيتها من ${otherUserName}`;
            const subTitle = `رقم العملية: ****${record.operation_number}`;
            const iconBadge = 'fa-exchange-alt text-blue-500';

            cardHTML = `
                <div class="bankak-card">
                    <div class="card-main-content">
                        <div class="details-wrapper">
                            <div class="bank-icon-container ${iconClass} ml-3">
                                <i class="fas fa-handshake"></i>
                                <span class="arrow-badge"><i class="fas ${iconBadge}"></i></span>
                            </div>
                            <div class="details-text text-right">
                                <p class="transaction-title">${mainTitle}</p>
                                <p class="transaction-sub">${subTitle}</p>
                            </div>
                        </div>
                        <div class="amount-display ${amountClass}">
                            ${amountText} <span class="text-sm font-normal">SDG</span>
                        </div>
                    </div>
                    <div class="card-footer-date">
                        <span><i class="far fa-calendar-alt ml-1"></i> ${date}</span>
                        <span><i class="far fa-clock ml-1"></i> ${time}</span>
                    </div>
                </div>
            `;
        }

        container.innerHTML += cardHTML;
    });

    if (loadingIndicator) loadingIndicator.classList.add('hidden'); // إخفاء مؤشر التحميل
    isLoadingHistory = false;
}

// ... (بقية الدوال المتعلقة بسجل العمليات لم تتغير) ...

// ============================================================
// 🔔 منطق الإشعارات (Notifications Logic)
// ============================================================

// ... (دالة loadNotifications لم تتغير) ...

// ... (دالة displayNotifications لم تتغير) ...

// ... (دالة markNotificationAsRead لم تتغير) ...

// ... (دالة checkScrollForMoreNotifications لم تتغير) ...

// ============================================================
// 💾 دوال إخفاء المودال (مختصرة للعرض) - تم تعديلها 🔥
// ============================================================

// ... (دوال hideModal, hideSuccessModal, showNotifications, hideNotificationModal لم تتغير) ...

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
        }
    });

    // جلب المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);

            if (window.location.href.includes('summary.html')) {
                if (allSettlements.length > 0) {
                    calculateNetBalances();
                    updateSummaryDisplay();
                }
            }
            if (window.location.href.includes('history.html')) {
                currentPage = 1; 
                filterHistory(activeFilter);
                displayHistory();
            }
            if (window.location.href.includes('my_expenses.html')) {
                displayPersonalExpenses();
            }

        } else {
            allExpenses = [];
            if (window.location.href.includes('history.html')) {
                currentPage = 1; 
                filterHistory(activeFilter);
                displayHistory();
            }
        }
    });

    // جلب التسويات
    onValue(ref(db, 'settlements'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allSettlements = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] }));
        } else {
            allSettlements = [];
        }

        if (window.location.href.includes('summary.html')) {
            calculateNetBalances();
            updateSummaryDisplay();
        }
        if (window.location.href.includes('history.html')) {
            currentPage = 1; 
            filterHistory(activeFilter);
            displayHistory();
        }
    });

    // جلب الإشعارات
    loadNotifications();
}

// ============================================================
// 🔐 المصادقة والبداية (Entry Point) - تم تعديله 🔥
// ============================================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        
        // 🌟 تعديل #1 🌟: استدعاء تحديث العرض هنا لضمان ظهور اسم المستخدم فوراً
        updateHomeDisplay(); 

        loadData();

        // 🔥 إضافة مستمع حدث التمرير للسجلات هنا (فقط في صفحة history.html)
        if (window.location.href.includes('history.html')) {
            window.addEventListener('scroll', checkScrollForMoreHistory);
        }

        const logoutSidebarBtn = document.getElementById('logoutSidebarButton');
        if (logoutSidebarBtn) logoutSidebarBtn.onclick = () => auth.signOut().then(() => window.location.href = 'auth.html');

    } else {
        // 🔥 إزالة مستمع حدث التمرير عند تسجيل الخروج
        window.removeEventListener('scroll', checkScrollForMoreHistory);
        
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});


// ... (باقي الدوال الخاصة بالتسوية والمودالات لم يتم تعديلها) ...
