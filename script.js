// ============================================================
// 🔒 وظيفة حماية المحتوى العامة (منع النسخ والتحديد والضغط المطول)
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
        /* CSS لشاشة التحميل - ضروري للعمل */
        .loading-overlay {
            position: fixed; /* تغيير إلى fixed لضمان تغطية الشاشة بالكامل */
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.95);
            display: flex; 
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 9999; /* قيمة عالية جداً */
            transition: opacity 0.3s;
        }
        .loading-overlay.hidden {
            display: none;
            opacity: 0;
        }
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // 2. منع النقر بزر الفأرة الأيمن (Context Menu)
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    // 3. منع اختصارات لوحة المفاتيح الشائعة
    document.addEventListener('keydown', function(e) {
        const targetTag = e.target.tagName;
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || e.target.getAttribute('contenteditable') === 'true') {
             return; 
        }
        
        if (e.ctrlKey || e.metaKey) {
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
    window.db = db; 
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
let loadedFlags = { users: false, expenses: false, settlements: false }; // ✨ جديد: أعلام حالة التحميل

// متغيرات خاصة بسجل العمليات (History)
let itemsPerPage = 10;
let currentPage = 1;
let activeFilter = '30days'; 
let filteredHistory = []; 

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
window.hideModal = function() {
    const modals = document.querySelectorAll('.modal.show');
    modals.forEach(modal => modal.classList.remove('show'));
}

// ============================================================
// ⏳ منطق التحقق من حالة التحميل وإخفاء المؤشر
// ============================================================

/**
 * دالة لتسجيل اكتمال تحميل مجموعة بيانات وإخفاء المؤشر العام عند اكتمال الجميع
 */
function checkLoadingStatus(dataKey) {
    loadedFlags[dataKey] = true;
    
    // التحقق مما إذا كانت جميع البيانات الرئيسية قد تم تحميلها
    if (loadedFlags.users && loadedFlags.expenses && loadedFlags.settlements) {
        const loadingOverlay = document.getElementById('loadingOverlay');
        // 🌟 إخفاء مؤشر التحميل
        if (loadingOverlay) loadingOverlay.classList.add('hidden'); 
    }
}

// ============================================================
// 🏠 منطق الصفحة الرئيسية (Home Logic)
// ============================================================
function updateHomeDisplay() {
    // ... (نفس الكود السابق للدالة) ...
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
// 💾 منطق حفظ المصروفات (مع حماية الزر)
// ============================================================

function calculateShare(amount, participantsCount) {
    if (participantsCount === 0) return 0;
    return roundToTwo(amount / participantsCount);
}

window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value.trim();
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const isMessenger = document.getElementById('isMessenger').checked;
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked');

    let selectedParticipantsUids = Array.from(checkboxes).map(cb => cb.dataset.uid);
    selectedParticipantsUids.push(currentUserID); 
    selectedParticipantsUids = [...new Set(selectedParticipantsUids)];

    if (!title || isNaN(amount) || amount <= 0 || selectedParticipantsUids.length < 2) {
        alert("يرجى إدخال اسم المصروف والمبلغ، وتحديد مشارك واحد على الأقل (بالإضافة إليك).");
        return;
    }

    const share = calculateShare(amount, selectedParticipantsUids.length);

    let finalParticipantsUids = selectedParticipantsUids;
    let finalShare = share;

    if (isMessenger) {
        finalParticipantsUids = selectedParticipantsUids.filter(uid => uid !== currentUserID);
        finalShare = calculateShare(amount, finalParticipantsUids.length);

        if (finalParticipantsUids.length === 0) {
            alert("إذا كنت مرسالاً، يجب تحديد مشاركين آخرين غيرك.");
            return;
        }
    }

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

    window.tempExpenseData = {
        title: title,
        amount: amount,
        share: finalShare,
        participants: finalParticipantsUids,
        isMessenger: isMessenger
    };

    document.getElementById('previewModal').classList.add('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';

    document.getElementById('warning').style.display = 'none';
};

window.handleSaveClick = function() {
    if (!window.tempExpenseData) return;

    if (window.tempExpenseData.isMessenger) {
        document.getElementById('previewDetails').style.display = 'none';
        document.getElementById('messengerConfirmation').style.display = 'block';
        const messengerWarningP = document.querySelector('#messengerConfirmation .messenger-warning p');
        if(messengerWarningP) messengerWarningP.innerHTML = `سيتم خصم المبلغ بالكامل (${window.tempExpenseData.amount.toLocaleString('en-US')} SDG) من حسابك في التطبيق كدين على الآخرين.`;
    } else {
        window.saveExpense(document.getElementById('confirmSaveButton')); // تمرير الزر إلى دالة الحفظ
    }
};


/**
 * 🔥 الدالة النهائية لحفظ المصروف وتحديث الأرصدة (مع حماية الزر)
 * @param {HTMLButtonElement} buttonElement - زر التأكيد
 */
window.saveExpense = async function(buttonElement) {
    const data = window.tempExpenseData;
    
    // 🌟 الخطوة 1: تعطيل الزر
    if (buttonElement) {
        buttonElement.disabled = true; 
        buttonElement.textContent = 'جاري الحفظ...';
    }

    if (!data || !currentUserID || !db) {
        // إعادة تمكين الزر في حال وجود خطأ في البيانات
        if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.textContent = 'حفظ المصروف';
        }
        return;
    }

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
        let payerContribution; 
        if (data.isMessenger) {
           payerContribution = data.amount; 
        } else {
            payerContribution = roundToTwo(data.amount - data.share);
        }

        const updates = {};
        const oldBalance = currentUserDB.balance || 0;
        const newBalance = roundToTwo(oldBalance + payerContribution);

        updates[`users/${currentUserID}/balance`] = newBalance;
        currentUserDB.balance = newBalance; 

        const participantsToDebit = data.participants.filter(uid => uid !== currentUserID);

        participantsToDebit.forEach(uid => {
            const user = allUsers.find(u => u.uid === uid);
            if (user) {
                const newParticipantBalance = roundToTwo(user.balance - data.share);
                updates[`users/${uid}/balance`] = newParticipantBalance;
                user.balance = newParticipantBalance; 

                // إضافة إشعار
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

        const newExpenseKey = push(ref(db, 'expenses')).key;
        updates[`expenses/${newExpenseKey}`] = expenseRecord;

        await update(ref(db), updates);

        // 🌟 عند النجاح:
        window.hideModal();
        document.getElementById('successModal').classList.add('show');
        document.getElementById('expenseForm').reset();
        window.tempExpenseData = null; 
        
        // إعادة تمكين الزر فقط في حالة عدم وجود مودال النجاح
        if (buttonElement && !document.getElementById('successModal').classList.contains('show')) {
            buttonElement.disabled = false; 
            buttonElement.textContent = 'حفظ المصروف';
        }


    } catch (e) {
        console.error("Error saving expense and updating balances:", e);
        alert("حدث خطأ أثناء حفظ المصروف. الرجاء المحاولة مرة أخرى.");
        
        // 🚨 إعادة تمكين الزر في حال حدوث خطأ
        if (buttonElement) {
            buttonElement.disabled = false; 
            buttonElement.textContent = 'حفظ المصروف';
        }
    }
};

// ============================================================
// 💰 منطق التسوية (Settlement Logic) 🔥 الحل لمشكلة الضغط المزدوج
// ============================================================

window.showSettleModal = function(userName, amount, uid) {
    currentSettleUser = userName;
    currentSettleMaxAmount = amount;
    currentSettleRecipientUID = uid; 

    document.getElementById('settleUserName').textContent = userName;
    document.getElementById('settleMaxAmount').textContent = amount.toLocaleString('en-US', {minimumFractionDigits: 2});
    
    const amountInput = document.getElementById('settlementAmount');
    amountInput.value = amount.toLocaleString('en-US');
    amountInput.max = amount; 
    
    // إعادة تمكين الزر عند فتح المودال لأول مرة
    const confirmButton = document.getElementById('confirmSettleButton');
    if (confirmButton) {
         confirmButton.disabled = false;
         confirmButton.textContent = 'تأكيد التسوية';
    }

    document.getElementById('settleModal').classList.add('show');
};


/**
 * 🔥 دالة حفظ التسوية وتحديث الأرصدة (مع حماية الزر)
 * @param {HTMLButtonElement} buttonElement - زر التأكيد الذي تم الضغط عليه
 */
window.saveSettlement = async function(buttonElement) {
    if (!currentUserID || !db) return;

    // 🌟 الخطوة 1: تعطيل الزر لمنع الضغط المزدوج
    buttonElement.disabled = true; 
    buttonElement.textContent = 'جاري التأكيد...'; 

    const amountStr = document.getElementById('settlementAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const recipientUID = currentSettleRecipientUID; 
    const payerUID = currentUserID; 

    if (isNaN(amount) || amount <= 0) {
        alert("يرجى إدخال مبلغ صحيح للتسوية.");
        buttonElement.disabled = false; 
        buttonElement.textContent = 'تأكيد التسوية';
        return;
    }
    
    if (amount > currentSettleMaxAmount + 0.1) {
        alert(`لا يمكنك تسوية مبلغ يزيد عن ${currentSettleMaxAmount.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG.`);
        buttonElement.disabled = false;
        buttonElement.textContent = 'تأكيد التسوية';
        return;
    }

    const operationNumber = Math.floor(Math.random() * 90000000) + 10000000; 

    const settlementRecord = {
        amount: roundToTwo(amount),
        payer_id: payerUID,
        recipient_id: recipientUID,
        timestamp: Date.now(),
        operation_number: operationNumber
    };

    try {
        const updates = {};
        
        const payerUser = allUsers.find(u => u.uid === payerUID);
        const payerOldBalance = payerUser.balance || 0;
        const payerNewBalance = roundToTwo(payerOldBalance + amount);
        updates[`users/${payerUID}/balance`] = payerNewBalance;

        const recipientUser = allUsers.find(u => u.uid === recipientUID);
        const recipientOldBalance = recipientUser.balance || 0;
        const recipientNewBalance = roundToTwo(recipientOldBalance - amount);
        updates[`users/${recipientUID}/balance`] = recipientNewBalance;
        
        const newSettlementKey = push(ref(db, 'settlements')).key;
        updates[`settlements/${newSettlementKey}`] = settlementRecord;

        await update(ref(db), updates);

        // 4. تحديث الأرصدة والقوائم المحلية لتعكس التغيير فوراً 
        payerUser.balance = payerNewBalance;
        recipientUser.balance = recipientNewBalance;
        allSettlements.push(settlementRecord); 
        
        if (payerUID === currentUserID) {
            currentUserDB.balance = payerNewBalance;
        }

        // 5. تحديث واجهة المستخدم
        calculateNetBalances(); 
        updateSummaryDisplay(); 
        updateHomeDisplay(); 
        
        // 6. إخفاء المودال وإظهار النجاح
        window.hideModal();
        document.getElementById('successModal').classList.add('show');

    } catch (e) {
        console.error("Error executing settlement:", e);
        alert("حدث خطأ أثناء تنفيذ التسوية. الرجاء المحاولة مرة أخرى.");
        // 🚨 إعادة تمكين الزر في حالة حدوث خطأ
        buttonElement.disabled = false; 
        buttonElement.textContent = 'تأكيد التسوية';
    }
};

// ============================================================
// 📊 منطق المصروفات الشخصية و التسوية (المعتمدة على التحميل)
// ============================================================
function displayPersonalExpenses() {
    // ... (نفس الكود السابق للدالة) ...
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
        totalPersonalDebt.toFixed(2);
        totalExpensesEl.textContent = totalPersonalDebt.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2});
    }
}

function calculateNetBalances() {
    // ... (نفس الكود السابق للدالة) ...
    if (!currentUserID || allUsers.length === 0) return;

    netBalances = {};
    allUsers.forEach(user => {
        if (user.uid !== currentUserID) {
            netBalances[user.uid] = 0;
        }
    });

    allExpenses.forEach(expense => {
        const payerId = expense.payer_id;
        const share = expense.share;
        const isMessenger = expense.is_messenger || false;

        if (payerId === currentUserID) {
            const participantsToCheck = isMessenger 
                ? expense.participants_ids.filter(id => id !== currentUserID)
                : expense.participants_ids.filter(id => id !== currentUserID);

            participantsToCheck.forEach(participantId => {
                if(netBalances[participantId] !== undefined) {
                    netBalances[participantId] = roundToTwo(netBalances[participantId] + share);
                }
            });
        }
        else if (expense.participants_ids.includes(currentUserID)) {
            if(netBalances[payerId] !== undefined) {
                netBalances[payerId] = roundToTwo(netBalances[payerId] - share);
            }
        }
    });

    allSettlements.forEach(settlement => {
        const { payer_id, recipient_id, amount } = settlement;

        if (payer_id === currentUserID && netBalances[recipient_id] !== undefined) {
            netBalances[recipient_id] = roundToTwo(netBalances[recipient_id] + amount);
        } 

        else if (recipient_id === currentUserID && netBalances[payer_id] !== undefined) {
            netBalances[payer_id] = roundToTwo(netBalances[payer_id] - amount);
        }
    });
}

function updateSummaryDisplay() {
    // ... (نفس الكود السابق للدالة) ...
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
    claimList.innerHTML = ''; 

    Object.keys(netBalances).forEach(otherUID => {
        const netAmount = netBalances[otherUID];
        const otherUserName = getUserNameById(otherUID);

        if (Math.abs(netAmount) < 0.1) return;

        if (netAmount < 0) {
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
            const amount = netAmount;
            totalCredit += amount;
            hasClaimItems = true;
        }
    });

    totalDebtEl.innerHTML = `${roundToTwo(totalDebt).toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;
    totalCreditEl.innerHTML = `${roundToTwo(totalCredit).toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;

    if (noDebtsEl) {
        if (!hasDebtItems) {
            noDebtsEl.classList.remove('hidden');
            debtContainer.innerHTML = '';
        } else {
            noDebtsEl.classList.add('hidden');
        }
    }

    if (hasClaimItems) {
        claimList.innerHTML = '';
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
window.nudgeUser = function(userName, uid) {
    alert(`تم إرسال "نكز" إلى ${userName} (${uid}) لتذكيره بالدين.`);
}


// ============================================================
// 🔥 منطق سجل العمليات (History Logic) 
// ============================================================

function combineAndSortHistory() {
    // ... (نفس الكود السابق للدالة) ...
    const combined = [];

    allExpenses.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);
        
        if (isPayer && (expense.is_messenger || false) && expense.share < 0.1 && expense.total_amount < 0.1) return;

        if (isPayer || isParticipant) {
             combined.push({
                type: 'expense',
                ...expense,
                timestamp: expense.timestamp
            });
        }
    });

    allSettlements.forEach(settlement => {
        if (settlement.payer_id === currentUserID || settlement.recipient_id === currentUserID) {
            combined.push({
                type: 'settlement',
                ...settlement,
                timestamp: settlement.timestamp
            });
        }
    });

    return combined.sort((a, b) => b.timestamp - a.timestamp);
}

function filterHistory(filter) {
    // ... (نفس الكود السابق للدالة) ...
    const allHistory = combineAndSortHistory();
    const now = Date.now();
    
    filteredHistory = allHistory.filter(record => {
        if (filter === '30days') {
            const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
            return record.timestamp >= thirtyDaysAgo;
        } else if (filter === '3months') {
            const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
            return record.timestamp >= ninetyDaysAgo;
        }

        else if (filter === 'incoming') {
            const isPayer = record.payer_id === currentUserID;
            if (record.type === 'expense' && isPayer && (record.total_amount - (record.share || 0)) > 0.1) return true;
            if (record.type === 'expense' && isPayer && (record.is_messenger || false)) return true;
            if (record.type === 'settlement' && record.recipient_id === currentUserID) return true;
            return false;
        }

        else if (filter === 'outgoing') {
            if (record.type === 'expense' && record.participants_ids.includes(currentUserID) && record.payer_id !== currentUserID) return true;
            if (record.type === 'settlement' && record.payer_id === currentUserID) return true;
            return false;
        }

        return true;
    });
}

function displayHistory() {
    // ... (نفس الكود السابق للدالة) ...
    const container = document.getElementById('expensesContainer');
    const loadMoreBtn = document.getElementById('loadMoreButton');
    if (!container) return;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = currentPage * itemsPerPage;
    const recordsToShow = filteredHistory.slice(startIndex, endIndex);

    if (currentPage === 1) {
        container.innerHTML = ''; 
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
                const amountClaimed = (record.is_messenger || false) ? record.total_amount : roundToTwo(record.total_amount - share);
                
                if (amountClaimed > 0.1) {
                    amountText = `+ ${amountClaimed.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                    iconClass = 'icon-success';
                    amountClass = 'amount-pos';
                    mainTitle = (record.is_messenger || false) ? `دفعة لك (كمرسال) عن: ${record.title}` : `دفعة لك من مشاركين في: ${record.title}`;
                    iconBadge = 'fa-arrow-up text-green-500';
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
            const subTitle = `رقم العملية: ****${String(record.operation_number).slice(-4)}`;
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

    if (endIndex < filteredHistory.length) {
        if (loadMoreBtn) loadMoreBtn.classList.remove('hidden');
    } else {
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
    }
}


// ============================================================
// ⚙️ منطق إعداد المستمعين (مع مؤشر التحميل)
// ============================================================
function startFirebaseListeners() {
    if (!currentUserID || !db) return;

    // 🌟 إظهار مؤشر التحميل العام عند بدء جلب البيانات
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    // 1. الاستماع للمستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        allUsers = [];
        snapshot.forEach(childSnapshot => {
            const user = childSnapshot.val();
            user.uid = childSnapshot.key;
            allUsers.push(user);
        });
        currentUserDB = allUsers.find(u => u.uid === currentUserID) || currentUserDB;
        
        updateHomeDisplay();
        populateParticipants();
        
        // 🔔 اكتمال تحميل المستخدمين
        checkLoadingStatus('users'); 
    });
    
    // 2. الاستماع للمصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        allExpenses = [];
        snapshot.forEach(childSnapshot => {
            allExpenses.push(childSnapshot.val());
        });

        displayPersonalExpenses(); 
        
        // 🔔 اكتمال تحميل المصروفات
        checkLoadingStatus('expenses');
    });

    // 3. الاستماع للتسويات
    onValue(ref(db, 'settlements'), (snapshot) => {
        allSettlements = [];
        snapshot.forEach(childSnapshot => {
            allSettlements.push(childSnapshot.val());
        });

        calculateNetBalances(); 
        updateSummaryDisplay(); 
        
        // 🔔 اكتمال تحميل التسويات
        checkLoadingStatus('settlements');
    });
}

// ------------------------------------------------------------
// 🔑 منطق التحقق من المصادقة (Auth State)
// ------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        // 🚨 بمجرد الحصول على ID المستخدم، ابدأ بالاستماع للبيانات
        startFirebaseListeners(); 
    } else {
        // إذا لم يكن هناك مستخدم، قد ترغب في إعادة التوجيه إلى صفحة تسجيل الدخول
        console.log("No user signed in.");
        // window.location.href = "login.html";
    }
});