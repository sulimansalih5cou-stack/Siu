// ============================================================
// 🔒 وظيفة حماية المحتوى العامة (منع النسخ والتحديد والضغط المطول) 🔥
// ** النسخة المصححة: تسمح باللمس والكتابة والتمرير، وتمنع النقر الأيمن والاختصارات **
// ============================================================
(function() {
    // 1. منع تحديد النص باستخدام CSS (الطريقة الآمنة لردع النسخ)
    const style = document.createElement('style');
    style.textContent = `
        body {
            user-select: none;
            -webkit-user-select: none; /* كروم، سفاري، أندرويد */
            -moz-user-select: none;    /* فايرفوكس */
            -ms-user-select: none;     /* إيدج القديم */
            -webkit-touch-callout: none; /* لمنع ظهور قائمة النسخ في iOS */
        }
        /* السماح بالتحديد والكتابة داخل حقول الإدخال بشكل صريح */
        input, textarea, [contenteditable] {
            user-select: auto !important;
            -webkit-user-select: auto !important;
            -moz-user-select: auto !important;
            -ms-user-select: auto !important;
        }
    `;
    document.head.appendChild(style);

    // 2. منع النقر بزر الفأرة الأيمن (Context Menu) - لا يوقف التفاعل
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    // 3. منع اختصارات لوحة المفاتيح الشائعة (Ctrl/Cmd + C, U, A) - لا يوقف التفاعل
    document.addEventListener('keydown', function(e) {
        // التحقق من أن المستخدم لا يكتب في حقل إدخال (حيث تكون الاختصارات مطلوبة)
        const targetTag = e.target.tagName;
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || e.target.getAttribute('contenteditable') === 'true') {
             return; // السماح بالاختصارات إذا كان المستخدم يكتب
        }
        
        if (e.ctrlKey || e.metaKey) {
            // منع C: نسخ، U: مصدر الصفحة، A: تحديد الكل
            if (e.key === 'c' || e.key === 'C' || e.key === 'u' || e.key === 'U' || e.key === 'a' || e.key === 'A') {
                e.preventDefault();
            }
        }
    });
})();
// ============================================================
// ------------------------------------------------------------
// 🚀 بداية منطق التطبيق (كود Firebase) 
// ------------------------------------------------------------

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
let allSettlements = []; // ✨ جديد: لتخزين سجلات التسويات
let netBalances = {};

// 🔥 متغيرات خاصة بسجل العمليات (History) 🔥
let itemsPerPage = 10;
let currentPage = 1;
let activeFilter = '30days'; 
let filteredHistory = []; // قائمة السجلات المدمجة والمفلترة
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

    if (!balanceEl && !nameEl) return;

    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;

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
// 💾 منطق حفظ المصروفات (لصفحة index.html) 🔥 الإضافة الجديدة
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
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked');

    // يجب أن تشمل الدافع
    let selectedParticipantsUids = Array.from(checkboxes).map(cb => cb.dataset.uid);
    selectedParticipantsUids.push(currentUserID); 

    // إزالة التكرارات وضمان وجود الدافع
    selectedParticipantsUids = [...new Set(selectedParticipantsUids)];

    // التحقق من الإدخال
    if (!title || isNaN(amount) || amount <= 0 || selectedParticipantsUids.length < 2) {
        alert("يرجى إدخال اسم المصروف والمبلغ، وتحديد مشارك واحد على الأقل (بالإضافة إليك).");
        return;
    }

    // حساب الحصة
    const share = calculateShare(amount, selectedParticipantsUids.length);

    // إذا كنت مرسالاً (لست مشاركاً)، يتم حساب الحصة على أساس الآخرين فقط
    let finalParticipantsUids = selectedParticipantsUids;
    let finalShare = share;

    if (isMessenger) {
        // المرسال لا يُعتبر مشاركاً في التقسيم
        finalParticipantsUids = selectedParticipantsUids.filter(uid => uid !== currentUserID);
        finalShare = calculateShare(amount, finalParticipantsUids.length);

        if (finalParticipantsUids.length === 0) {
            alert("إذا كنت مرسالاً، يجب تحديد مشاركين آخرين غيرك.");
            return;
        }
    }

    // النص الذي سيعرض في المعاينة
    const participantsNames = finalParticipantsUids.map(uid => getUserNameById(uid)).join('، ');

    let previewHTML = `
        <p><strong>اسم المصروف:</strong> ${title}</p>
        <p><strong>المبلغ الكلي:</strong> ${amount.toLocaleString('en-US')} SDG</p>
        <p><strong>الدافع:</strong> ${getUserNameById(currentUserID)}</p>
        <p><strong>المشاركون:</strong> ${participantsNames}</p>
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
        participants: finalParticipantsUids,
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
        // تحديث نص المبلغ في تنبيه المرسال (اختياري)
        const messengerWarningP = document.querySelector('#messengerConfirmation .messenger-warning p');
        if(messengerWarningP) messengerWarningP.innerHTML = messengerWarningP.innerHTML.replace('سيظهر هنا', window.tempExpenseData.amount.toLocaleString('en-US') + ' SDG');
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
        const updates = {};
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

    } catch (e) {
        console.error("Error saving expense and updating balances:", e);
        alert("حدث خطأ أثناء حفظ المصروف. الرجاء المحاولة مرة أخرى.");
    }
};
// نهاية إضافة منطق حفظ المصروفات
// ============================================================


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

            // لا ننشئ الـ HTML هنا، سنقوم بذلك في الخطوة التالية
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
                         <span class="text-green-600 font-bold dir-ltr">${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</span>
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
// 🔥 منطق سجل العمليات (History Logic) - الجزء المضاف 🔥
// ============================================================

/**
 * دالة لدمج المصروفات والتسويات وفرزها زمنياً
 * @returns {Array} قائمة مدمجة من السجلات مفروزة بالتنازل حسب الوقت
 */
function combineAndSortHistory() {
    const combined = [];

    // 1. إضافة المصروفات
    allExpenses.forEach(expense => {
        // نضمّن المصروفات التي أنت الدافع لها، أو التي أنت مشارك فيها (مدين)
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);
        
        // إذا كان الدافع ومرسال والحصة 0، نتجاهل هذا المصروف من العرض المباشر في السجل
        if (isPayer && (expense.is_messenger || false) && expense.share < 0.1 && expense.total_amount < 0.1) return;

        if (isPayer || isParticipant) {
             combined.push({
                type: 'expense',
                ...expense,
                timestamp: expense.timestamp
            });
        }
    });

    // 2. إضافة التسويات
    allSettlements.forEach(settlement => {
        // نضمّن التسويات التي أنت الدافع أو المستلم لها
        if (settlement.payer_id === currentUserID || settlement.recipient_id === currentUserID) {
            combined.push({
                type: 'settlement',
                ...settlement,
                timestamp: settlement.timestamp
            });
        }
    });

    // الفرز التنازلي حسب الطابع الزمني
    return combined.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * دالة لتصفية السجلات بناءً على المعايير المحددة
 * @param {string} filter - نوع الفلتر (e.g., '30days', 'incoming', 'outgoing', 'all')
 */
function filterHistory(filter) {
    const allHistory = combineAndSortHistory();
    const now = Date.now();
    
    filteredHistory = allHistory.filter(record => {
        // فلاتر الوقت
        if (filter === '30days') {
            const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
            return record.timestamp >= thirtyDaysAgo;
        } else if (filter === '3months') {
            const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
            return record.timestamp >= ninetyDaysAgo;
        }

        // فلتر الواردة (لك) - أنت المستفيد
        else if (filter === 'incoming') {
            // مصروف: أنت الدافع (تستحق مبالغ)
            const isPayer = record.payer_id === currentUserID;
            if (record.type === 'expense' && isPayer && (record.total_amount - (record.share || 0)) > 0.1) return true;
            if (record.type === 'expense' && isPayer && (record.is_messenger || false)) return true; // المرسال يستحق كامل المبلغ
            // تسوية: أنت المستلم (تلقيت تسوية دين)
            if (record.type === 'settlement' && record.recipient_id === currentUserID) return true;
            return false;
        }

        // فلتر الصادرة (عليك) - أنت الطرف الذي دفع/سدد
        else if (filter === 'outgoing') {
            // مصروف: أنت مشارك ولكن لست الدافع (دين عليك)
            if (record.type === 'expense' && record.participants_ids.includes(currentUserID) && record.payer_id !== currentUserID) return true;
            // تسوية: أنت الدافع (سددت دين)
            if (record.type === 'settlement' && record.payer_id === currentUserID) return true;
            return false;
        }

        // فلتر 'الكل'
        return true;
    });
}

/**
 * الدالة الرئيسية لعرض سجل العمليات في history.html
 * تطبق آلية "عرض المزيد" (Lazy Loading)
 */
function displayHistory() {
    const container = document.getElementById('expensesContainer');
    const loadMoreBtn = document.getElementById('loadMoreButton');
    if (!container) return;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = currentPage * itemsPerPage;
    const recordsToShow = filteredHistory.slice(startIndex, endIndex);

    if (currentPage === 1) {
        container.innerHTML = ''; // إفراغ الحاوية عند التحميل أو تغيير الفلتر
    }

    if (recordsToShow.length === 0 && currentPage === 1) {
        container.innerHTML = `
            <p class="text-center text-gray-500 mt-12 py-10 border rounded-lg bg-white shadow-sm">
                <i class="fas fa-file-invoice-dollar fa-3x mb-4 text-red-500"></i><br>
                لا توجد سجلات معاملات مطابقة للفلتر الحالي.
            </p>
        `;
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }

    recordsToShow.forEach(record => {
        let cardHTML = '';
        const { date, time } = formatBankDate(record.timestamp);

        if (record.type === 'expense') {
            const isPayer = record.payer_id === currentUserID;
            const payerName = getUserNameById(record.payer_id);
            const share = record.share || 0;

            let iconClass = 'icon-danger';
            let amountClass = 'amount-neg';
            let amountText = '0.00';
            let mainTitle = `تفاصيل المصروف: ${record.title}`;
            let subTitle = `المبلغ الكلي: ${record.total_amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG`;
            let iconBadge = 'fa-arrow-down text-red-500';

            if (isPayer) {
                // أنت الدافع. المبلغ الذي تستحقه من الآخرين
                const amountClaimed = (record.is_messenger || false) ? record.total_amount : roundToTwo(record.total_amount - share);
                
                if (amountClaimed > 0.1) {
                    amountText = `+ ${amountClaimed.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                    iconClass = 'icon-success';
                    amountClass = 'amount-pos';
                    mainTitle = (record.is_messenger || false) ? `دفعة لك (كمرسال) عن: ${record.title}` : `دفعة لك من مشاركين في: ${record.title}`;
                    iconBadge = 'fa-arrow-up text-green-500';
                } else {
                    return; // تجنّب عرض مصروف الدافع الذي حصته صفر وليس مرسالاً
                }
            } else {
                // أنت مشارك ولست الدافع (دين عليك)
                if (share > 0.1) {
                    amountText = `- ${share.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                    mainTitle = `دين عليك لـ ${payerName} في: ${record.title}`;
                } else {
                    return; // تجنّب عرض سجلات المشاركة التي حصتها صفر
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
                        <div class="amount-display ${amountClass}"> ${amountText} <span class="text-sm font-normal">SDG</span> </div>
                    </div>
                    <div class="card-footer-date">
                        <span><i class="far fa-calendar-alt ml-1"></i> ${date}</span>
                        <span><i class="far fa-clock ml-1"></i> ${time}</span>
                    </div>
                </div>
            `;
        } else if (record.type === 'settlement') {
            const isPayer = record.payer_id === currentUserID;
            const otherUserName = isPayer ? getUserNameById(record.recipient_id) : getUserNameById(record.payer_id);
            const iconClass = isPayer ? 'icon-danger' : 'icon-success';
            const amountClass = isPayer ? 'amount-neg' : 'amount-pos';
            const amountText = isPayer 
                ? `- ${record.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}` 
                : `+ ${record.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            const mainTitle = isPayer 
                ? `تسوية دين دفعتها لـ ${otherUserName}` 
                : `تسوية دين تلقيتها من ${otherUserName}`;
            const subTitle = `رقم العملية: ****${record.operation_number}`;
            const iconBadge = 'fa-exchange-alt text-blue-500'; // أيقونة تبادل للتسوية

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
                        <div class="amount-display ${amountClass}"> ${amountText} <span class="text-sm font-normal">SDG</span> </div>
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

    // منطق عرض/إخفاء زر "عرض المزيد"
    if (endIndex < filteredHistory.length) {
        if (loadMoreBtn) loadMoreBtn.classList.remove('hidden');
    } else {
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
    }
}

/**
 * دالة لتغيير الفلتر وإعادة عرض السجلات
 * @param {string} filter - نوع الفلتر الجديد
 * @param {HTMLElement} element - عنصر الزر الذي تم النقر عليه
 */
window.setFilter = function(filter, element) {
    // تحديث الأنماط
    document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    // تحديث حالة الفلتر وإعادة التعيين
    activeFilter = filter;
    currentPage = 1;
    const container = document.getElementById('expensesContainer');
    if (container) {
         container.innerHTML = `
            <p class="text-center text-gray-400 mt-12">
                <i class="fas fa-spinner fa-spin fa-2x mb-4"></i><br>
                جاري تحميل السجلات...
            </p>
        `;
    }

    // تطبيق الفلتر وإعادة العرض
    filterHistory(activeFilter);
    displayHistory();
};

/**
 * دالة لتحميل المزيد من السجلات عند النقر على الزر
 */
window.loadMoreHistory = function() {
    currentPage++;
    displayHistory();
};

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
// 💾 دوال إخفاء المودال (مختصرة للعرض)
// ============================================================
window.hideModal = () => {
    document.getElementById('previewModal').classList.remove('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';
};

window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');

window.showNotifications = () => {
    document.getElementById('notificationModal').classList.add('show');
};

window.hideNotificationModal = () => {
    document.getElementById('notificationModal').classList.remove('show');
};

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
            populateParticipants();
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
                filterHistory(activeFilter); 
                displayHistory(); 
            }
            if (window.location.href.includes('my_expenses.html')) {
                displayPersonalExpenses();
            }
        } else {
            allExpenses = [];
            if (window.location.href.includes('history.html')) {
                filterHistory(activeFilter);
                displayHistory(); 
            }
        }
    });

    // ✨ جلب التسويات
    onValue(ref(db, 'settlements'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allSettlements = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] }));
        } else {
            allSettlements = [];
        }
        // تحديث ملخص الأرصدة وصفحة السجل بعد التأكد من تحميل التسويات
        if (window.location.href.includes('summary.html')) {
            calculateNetBalances(); 
            updateSummaryDisplay(); 
        }
        if (window.location.href.includes('history.html')) {
            filterHistory(activeFilter); 
            displayHistory(); 
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

        // تحديث معلومات الشريط الجانبي والهيدر مباشرة
        const sidebarName = document.getElementById('sidebarUserName');
        const sidebarEmail = document.getElementById('sidebarUserEmail');
        const displayHeaderName = document.getElementById('displayHeaderName');
        const displayHeaderEmail = document.getElementById('displayHeaderEmail');

        if (sidebarName) sidebarName.textContent = user.displayName || 'مستخدم';
        if (sidebarEmail) sidebarEmail.textContent = user.email || '';
        if (displayHeaderName) displayHeaderName.textContent = user.displayName || 'مستخدم';
        if (displayHeaderEmail) displayHeaderEmail.textContent = user.email || '';


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
// تم تعديل هذه الدالة لإضافة رقم العملية إلى الإشعار
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
        operation_number: opNumber,
        timestamp: Date.now()
    };

    // 4. إشعار للمستلم (تم التعديل هنا)
    const notificationTime = Date.now();
    const newNotifKey = push(ref(db, 'notifications')).key;
    const opNumLastFour = opNumber; // opNumber يحتوي على آخر 4 أرقام من الدالة المستدعية

    updates[`notifications/${newNotifKey}`] = {
        uid: recipientUID,
        // 🔥 تم دمج رقم العملية في الرسالة هنا 🔥
        message: `${payerName} قام بتسوية دين بمبلغ ${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG لك. رقم العملية: ${opNumLastFour}`,
        timestamp: notificationTime,
        is_read: false,
        type: 'settlement_received',
        settlement_id: newSettleKey,
        operation_number: opNumLastFour // حفظ رقم العملية في الإشعار أيضاً
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

    // تأكد من وجود العناصر قبل الوصول إليها
    const settleRelationEl = document.getElementById('settleRelation');
    const maxSettleAmountDisplayEl = document.getElementById('maxSettleAmountDisplay');
    const settleAmountInputEl = document.getElementById('settleAmount');
    const settleModalEl = document.getElementById('settleModal');

    if (settleRelationEl) settleRelationEl.textContent = relationText;
    if (maxSettleAmountDisplayEl) maxSettleAmountDisplayEl.textContent = amount.toLocaleString(undefined, {minimumFractionDigits: 2});

    if (settleAmountInputEl) {
        settleAmountInputEl.setAttribute('max', amount);
        settleAmountInputEl.value = amount; 
    }

    if (settleModalEl) {
        settleModalEl.classList.add('show');
        if(settleAmountInputEl) settleAmountInputEl.dispatchEvent(new Event('input')); 
    }
}

window.hideSettleModal = function() {
    // ... (منطق إخفاء المودال) ...
    const settleModalEl = document.getElementById('settleModal');
    if(settleModalEl) settleModalEl.classList.remove('show');

    const settleForm = document.getElementById('settleForm');
    if(settleForm) settleForm.reset();

    const remainingEl = document.getElementById('remainingBalance');
    if(remainingEl) remainingEl.classList.add('hidden');

    currentSettleUser = '';
    currentSettleMaxAmount = 0;
    currentSettleRecipientUID = ''; 
}

// التأكد من أن النموذج موجود قبل إضافة المستمع
const settleFormEl = document.getElementById('settleForm');
if(settleFormEl) {
    settleFormEl.addEventListener('submit', async function(e) {
        e.preventDefault();

        const operationNumber = document.getElementById('operationNumber').value;
        const amount = parseFloat(document.getElementById('settleAmount').value);

        const opNumLastFour = operationNumber.slice(-4); 

        if (operationNumber.length < 4 || isNaN(parseInt(opNumLastFour))) {
            alert("يرجى إدخال رقم عملية مكون من 4 أرقام على الأقل.");
            return;
        }

        if (amount <= 0 || amount > currentSettleMaxAmount || !currentSettleRecipientUID) {
            alert(`المبلغ المدفوع يجب أن يكون صحيحاً والطرف الآخر محدداً. المبلغ الأقصى: ${currentSettleMaxAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}`);
            return;
        }

        const success = await sendSettleTransaction(currentSettleRecipientUID, amount, opNumLastFour);

        if (success) {
            alert(`تم تأكيد دفع ${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG لـ ${currentSettleUser}.`);
            hideSettleModal();
        }
    });
}