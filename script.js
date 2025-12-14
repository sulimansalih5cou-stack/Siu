// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
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

// 🔥 متغيرات خاصة بسجل العمليات (History) 🔥
let itemsPerPage = 10;
let currentPage = 1;
let activeFilter = '30days';
let filteredHistory = []; // قائمة السجلات المدمجة والمفلترة
let isLoadingHistory = false; 

// 🔥 متغيرات خاصة بالإشعارات (Notifications) 🔥
let notificationsPerPage = 10;
let currentNotificationPage = 1;
let isLoadingNotifications = false; 

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

/**
 * 🛠️ دالة تنسيق المبلغ أثناء الإدخال (تستخدم الفواصل الثلاثية)
 * @param {HTMLInputElement} input - حقل الإدخال
 */
window.formatAmountInput = function(input) {
    // 1. إزالة جميع الفواصل الحالية وأي حروف غير رقمية باستثناء النقطة العشرية
    let value = input.value.replace(/,/g, '').replace(/[^0-9.]/g, '');

    // 2. فصل الجزء العشري إذا وجد
    const parts = value.split('.');
    let integerPart = parts[0];
    const decimalPart = parts.length > 1 ? '.' + parts[1] : '';

    // 3. تطبيق تنسيق الفواصل الثلاثية على الجزء الصحيح
    // regex لتطبيق الفواصل كل 3 أرقام
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // 4. إعادة القيمة المنسقة إلى حقل الإدخال
    input.value = integerPart + decimalPart;
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
// 🔥 تم التعديل هنا لضمان تحديث الشريط الجانبي والهيدر بشكل موثوق
// ============================================================

function updateHomeDisplay() {
    const balanceEl = document.getElementById('currentBalance');
    const nameEl = document.getElementById('userNamePlaceholder');
    const cardEl = document.getElementById('currentBalanceCard');
    
    // 🔥🔥 عناصر الشريط الجانبي والهيدر
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarEmail = document.getElementById('sidebarUserEmail');
    const displayHeaderName = document.getElementById('displayHeaderName');
    const displayHeaderEmail = document.getElementById('displayHeaderEmail');

    let displayName = "مستخدم";
    let userEmail = auth.currentUser ? auth.currentUser.email || '' : '';
    
    // تحديد اسم العرض الأمثل
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;

    // 🟢 تحديث جميع عناصر الاسم
    if (nameEl) nameEl.textContent = displayName;
    if (displayHeaderName) displayHeaderName.textContent = displayName;
    if (sidebarName) sidebarName.textContent = displayName;

    // 🟢 تحديث جميع عناصر البريد الإلكتروني
    if (displayHeaderEmail) displayHeaderEmail.textContent = userEmail;
    if (sidebarEmail) sidebarEmail.textContent = userEmail;

    // تحديث الرصيد (الخاص بالصفحة الرئيسية فقط)
    const balance = (currentUserDB && currentUserDB.balance !== undefined) ? currentUserDB.balance : 0;
    if (balanceEl) {
        // 🔥 تنسيق الرصيد للعرض فقط
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
    // 🔥 التعديل هنا: نقرأ كـ "نص"، ثم نزيل الفواصل ونحول إلى رقم
    const amountInput = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountInput); 
    
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
        <p><strong>المبلغ الكلي:</strong> ${amount.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG</p>
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
        const amountDisplay = window.tempExpenseData.amount.toLocaleString('en-US', {minimumFractionDigits: 2}) + ' SDG';
        const messengerWarningP = document.querySelector('#messengerConfirmation .messenger-warning p');
        if(messengerWarningP) messengerWarningP.innerHTML = messengerWarningP.innerHTML.replace('سيظهر هنا', amountDisplay);

    } else {
        // إذا لم يكن مرسالاً، قم بالحفظ مباشرة
        window.saveExpense();
    }
};

/**
 * 🔥 الدالة النهائية لحفظ المصروف وتحديث الأرصدة (تستخدم المعاملات)
 */
window.saveExpense = async function() {
    const data = window.tempExpenseData;
    
    // 🛑 البحث عن الأزرار
    const confirmSaveButton = document.getElementById('confirmSaveButton'); 
    const confirmMessengerButton = document.getElementById('confirmMessengerButton'); 

    if (!data || !currentUserID || !db) return;

    // 2. 🛡️ تعطيل الأزرار لمنع الضغط المزدوج
    if (confirmSaveButton) {
        confirmSaveButton.disabled = true;
        confirmSaveButton.textContent = 'جاري الحفظ...'; 
    }
    if (confirmMessengerButton) {
        confirmMessengerButton.disabled = true;
        confirmMessengerButton.textContent = 'جاري التسجيل...'; 
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
    
    // 1. حساب قيمة التحويل للدافع (المستحق له)
    let payerContribution;
    if (data.isMessenger) {
        payerContribution = data.amount;
    } else {
        payerContribution = roundToTwo(data.amount - data.share);
    }
    
    const participantsToDebit = data.participants.filter(uid => uid !== currentUserID);
    
    const updates = {};
    const newExpenseRef = push(ref(db, 'expenses'));

    try {
        // -------------------------------------------------------------------
        // 🛑 تطبيق المعاملة على رصيد الدافع (لضمان أقصى دقة)
        // -------------------------------------------------------------------
        await runTransaction(ref(db, `users/${currentUserID}/balance`), (currentBalance) => {
            if (currentBalance === null) return 0 + payerContribution; // حالة الرصيد غير موجود
            return roundToTwo(currentBalance + payerContribution);
        });

        // -------------------------------------------------------------------
        // 🛑 تطبيق المعاملات على أرصدة المشاركين (المدينين)
        // -------------------------------------------------------------------
        for (const uid of participantsToDebit) {
            await runTransaction(ref(db, `users/${uid}/balance`), (currentBalance) => {
                if (currentBalance === null) return 0 - data.share;
                return roundToTwo(currentBalance - data.share);
            });

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

        // -------------------------------------------------------------------
        // 3. إضافة المصروف نفسه
        // -------------------------------------------------------------------
        updates[`expenses/${newExpenseRef.key}`] = expenseRecord;
        
        // تنفيذ التحديثات غير الحساسة (الإشعارات والمصروف)
        await update(ref(db), updates);

        // تحديث البيانات المحلية للمستخدم الدافع
        if (currentUserDB) {
            currentUserDB.balance = roundToTwo(currentUserDB.balance + payerContribution);
        }

        // إخفاء مودال المعاينة وعرض مودال النجاح
        window.hideModal();
        document.getElementById('successModal').classList.add('show');

        // إعادة تعيين النموذج
        document.getElementById('expenseForm').reset();
        window.tempExpenseData = null;

    } catch (e) {
        console.error("Error saving expense and updating balances:", e);
        alert("حدث خطأ أثناء حفظ المصروف. الرجاء المحاولة مرة أخرى.");
    } finally {
        // 5. 🟢 إعادة تمكين الأزرار وتحديث نصها (سواء نجح الحفظ أو فشل)
        if (confirmSaveButton) {
            confirmSaveButton.disabled = false;
            confirmSaveButton.textContent = 'حفظ'; // إعادة النص الأصلي
        }
        if (confirmMessengerButton) {
            confirmMessengerButton.disabled = false;
            confirmMessengerButton.textContent = 'موافق (تسجيل كمرسال)'; // إعادة النص الأصلي
        }
    }
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

    const personalList = allExpenses.filter(expense => 
        expense.participants_ids.includes(currentUserID)
    )
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
                    <div class="amount-display amount-neg">
                        - ${amountDisplay} <span class="text-sm font-normal">SDG</span>
                    </div>
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
            const participantsToCheck = isMessenger ? expense.participants_ids.filter(id => id !== currentUserID) : expense.participants_ids.filter(id => id !== currentUserID);

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
    // تطبيق تأثير التسويات على الأرصدة الصافية
    // ----------------------------------------------------
    allSettlements.forEach(settlement => {
        const { payer_id, recipient_id, amount } = settlement;

        // حالة 1: أنت الدافع (أنت من سدد الدين)
        if (payer_id === currentUserID && netBalances[recipient_id] !== undefined) {
            netBalances[recipient_id] = roundToTwo(netBalances[recipient_id] + amount);
        }

        // حالة 2: أنت المستلم (شخص سدد لك دين عليه)
        else if (recipient_id === currentUserID && netBalances[payer_id] !== undefined) {
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
    claimList.innerHTML = '<p class="text-center text-gray-400 py-4">جاري تحميل المستحقات...</p>'; 

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
                        <span class="balance-status">يدين لك ${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</span>
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
        claimList.innerHTML = ''; // إعادة إنشاء القائمة بعد إفراغها (لضمان الترتيب)
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
// 🔥 منطق سجل العمليات (History Logic) 
// ============================================================

/**
 * دالة لدمج المصروفات والتسويات وفرزها زمنياً
 * @returns {Array} قائمة مدمجة من السجلات مفروزة بالتنازل حسب الوقت
 */
function combineAndSortHistory() {
    const combined = [];

    // 1. إضافة المصروفات
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

    // 2. إضافة التسويات
    allSettlements.forEach(settlement => {
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
 */
function filterHistory(filter) {
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

/**
 * الدالة الرئيسية لعرض سجل العمليات (Infinite Scrolling)
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
    
    // 🔥 عرض مؤشر التحميل المؤقت
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
        } else if (record.type === 'settlement') {
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

/**
 * دالة لتغيير الفلتر وإعادة عرض السجلات
 */
window.setFilter = function(filter, element) {
    document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

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

    filterHistory(activeFilter);
    displayHistory();
};

/**
 * 🔄 دالة التحقق من التمرير اللانهائي للسجلات (History)
 */
function checkScrollForMoreHistory() {
    if (!window.location.href.includes('history.html')) {
        return;
    }

    // إيقاف التحميل إذا كان هناك عملية تحميل جارية أو إذا وصلنا لنهاية السجلات
    if (isLoadingHistory || currentPage * itemsPerPage >= filteredHistory.length) {
        return;
    }

    const scrollPosition = window.innerHeight + window.scrollY;
    const documentHeight = document.body.offsetHeight;
    const scrollThreshold = 300;

    if (scrollPosition >= documentHeight - scrollThreshold) {
        currentPage++;
        displayHistory(true);
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
            // تجميع وفرز جميع الإشعارات
            userNotifications = Object.keys(val)
                .map(key => ({ id: key, ...val[key] }))
                .filter(n => n.uid === currentUserID)
                .sort((a, b) => b.timestamp - a.timestamp); 
            
            // 🔥 إعادة تعيين الصفحة عند تحميل البيانات الجديدة
            currentNotificationPage = 1; 
            
            const notificationModal = document.getElementById('notificationModal');

            // 🟢 شرط العرض: إذا كان المودال موجوداً ومفتوحاً
            if (notificationModal && notificationModal.classList.contains('show')) {
                 displayNotifications();
            } else {
                 // 🟢 تحديث الشارة في كل الأحوال
                 updateNotificationBadge();
            }
            
        } else {
            userNotifications = [];
            updateNotificationBadge();
            displayNotifications();
        }
    });
}

/**
 * 🔔 دالة تحديث شارة الإشعارات
 */
function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    
    const unreadCount = userNotifications.filter(n => !n.is_read).length;
    badge.textContent = unreadCount.toString();
    
    if (unreadCount > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}


/**
 * دالة عرض الإشعارات مع دعم التحميل التزايدي (Lazy Loading)
 */
function displayNotifications(isAppending = false) {
    const listContainer = document.getElementById('notificationsList');
    
    if (!listContainer || isLoadingNotifications) return;

    isLoadingNotifications = true;

    const startIndex = (currentNotificationPage - 1) * notificationsPerPage;
    const endIndex = currentNotificationPage * notificationsPerPage;
    const notificationsToShow = userNotifications.slice(startIndex, endIndex);

    if (currentNotificationPage === 1 && !isAppending) {
        listContainer.innerHTML = ''; // إفراغ الحاوية عند التحميل لأول مرة
    }

    // تحديث الشارة قبل عرض القائمة
    updateNotificationBadge();

    if (notificationsToShow.length === 0 && currentNotificationPage === 1) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد إشعارات حالياً.</p>';
        isLoadingNotifications = false;
        return;
    }

    notificationsToShow.forEach(notification => {
        const statusClass = notification.is_read ? 'text-gray-500 bg-gray-50' : 'font-semibold bg-blue-50 hover:bg-blue-100';
        let icon = 'fa-info-circle text-blue-500';
        if (notification.type === 'settlement_received') {
            icon = 'fa-receipt text-green-500';
        } else if (notification.type === 'nudge') {
            icon = 'fa-bell-slash text-yellow-500';
        } else if (notification.type === 'debit') {
            icon = 'fa-minus-circle text-red-500';
        }

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

    isLoadingNotifications = false;
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

/**
 * 🔄 دالة التحقق من التمرير اللانهائي للإشعارات (Notifications)
 */
function checkScrollForMoreNotifications() {
    const modalContent = document.querySelector('#notificationModal .modal-content-inner');
    if (!modalContent || isLoadingNotifications || currentNotificationPage * notificationsPerPage >= userNotifications.length) {
        return;
    }

    // نحتاج للتحقق من التمرير داخل محتوى المودال نفسه
    const scrollPosition = modalContent.scrollTop + modalContent.clientHeight;
    const contentHeight = modalContent.scrollHeight;
    const scrollThreshold = 50; 

    if (scrollPosition >= contentHeight - scrollThreshold) {
        currentNotificationPage++;
        displayNotifications(true);
    }
}


// ============================================================
// 💾 دوال إخفاء المودال
// ============================================================

window.hideModal = () => {
    document.getElementById('previewModal').classList.remove('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';
};

window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');

// 🔥 تم التعديل هنا لضمان فتح المودال وتحميل البيانات في أي صفحة
window.showNotifications = () => {
    const modal = document.getElementById('notificationModal');
    const listContainer = document.getElementById('notificationsList'); 
    
    if (!modal || !listContainer) return; // الخروج إذا لم تكن العناصر موجودة في الصفحة

    // 1. إظهار المودال
    modal.classList.add('show');
    
    // 2. ضمان أننا نبدأ من الصفحة الأولى ونحمل البيانات
    currentNotificationPage = 1;
    displayNotifications(); // 🟢 تحميل الصفحة الأولى من الإشعارات

    // 3. نربط مستمع التمرير الخاص بالإشعارات
    const modalInner = document.querySelector('#notificationModal .modal-content-inner');
    const scrollElement = modalInner || listContainer;

    // نزيل المستمع القديم لمنع تكراره
    scrollElement.removeEventListener('scroll', checkScrollForMoreNotifications);
    // نضيف المستمع الجديد
    scrollElement.addEventListener('scroll', checkScrollForMoreNotifications);
};

window.hideNotificationModal = () => {
    const modal = document.getElementById('notificationModal');
    const listContainer = document.getElementById('notificationsList');
    
    // عند إغلاق المودال، نزيل مستمع التمرير
    if (listContainer) {
        const modalInner = document.querySelector('#notificationModal .modal-content-inner');
        const scrollElement = modalInner || listContainer;
        scrollElement.removeEventListener('scroll', checkScrollForMoreNotifications);
    }
    if (modal) modal.classList.remove('show');
};


// ============================================================
// 🔄 تحميل البيانات (Load Data)
// 🔥 تم التعديل هنا لضمان تحديث الشريط الجانبي فور جلب بيانات المستخدم
// ============================================================

function loadData() {
    if (!currentUserID || !db) return;

    // جلب المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            // 🟢 تحديث العرض عند جلب بيانات المستخدم
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
                // نضمن وجود التسويات قبل الحساب
                if (allSettlements.length > 0 || allExpenses.length > 0) {
                    calculateNetBalances();
                    updateSummaryDisplay();
                }
            }
            if (window.location.href.includes('history.html')) {
                // إعادة تعيين الصفحة عند تحديث البيانات
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

    // ✨ جلب التسويات
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
// 🔐 المصادقة والبداية (Entry Point) 
// ============================================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;

        loadData();
        
        // 🔥 ضمان تحديث واجهة المستخدم فور تسجيل الدخول/التحقق
        updateHomeDisplay(); 

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


// ============================================================
// 💰 منطق التسوية (Settle Logic) 🔥 تم تطبيق المعاملات هنا
// ============================================================

window.sendSettleTransaction = async function(recipientUID, amount, opNumber) {
    if (!currentUserID || !recipientUID || amount <= 0 || !db) {
        alert("خطأ في بيانات التسوية أو عدم اتصال بقاعدة البيانات.");
        return false;
    }

    const payerName = getUserNameById(currentUserID);
    const updates = {};
    const newSettleRef = push(ref(db, 'settlements'));

    try {
        // -------------------------------------------------------------------
        // 🛑 المعاملة 1: تحديث رصيد الدافع (الذي يدفع)
        // الدافع رصيده يزيد بقيمة التسوية (لتغطية الدين الذي سدده للآخر)
        // -------------------------------------------------------------------
        await runTransaction(ref(db, `users/${currentUserID}/balance`), (currentBalance) => {
            if (currentBalance === null) return 0 + amount;
            return roundToTwo(currentBalance + amount);
        });

        // -------------------------------------------------------------------
        // 🛑 المعاملة 2: تحديث رصيد المستلم (الذي تم سداد دينه)
        // المستلم رصيده ينقص بقيمة التسوية (لأن الدين الذي كان عليه قد سُدد)
        // -------------------------------------------------------------------
        await runTransaction(ref(db, `users/${recipientUID}/balance`), (currentBalance) => {
            if (currentBalance === null) return 0 - amount;
            return roundToTwo(currentBalance - amount);
        });

        // 3. إضافة سجل التسوية والإشعار
        updates[`settlements/${newSettleRef.key}`] = {
            payer_id: currentUserID,
            recipient_id: recipientUID,
            amount: amount,
            operation_number: opNumber,
            timestamp: Date.now()
        };

        const newNotifKey = push(ref(db, 'notifications')).key;
        updates[`notifications/${newNotifKey}`] = {
            uid: recipientUID,
            message: `${payerName} قام بتسوية دين بمبلغ ${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG لك.`,
            timestamp: Date.now(),
            is_read: false,
            type: 'settlement_received',
            settlement_id: newSettleRef.key
        };

        await update(ref(db), updates);

        return true;
    } catch (e) {
        console.error("Error performing settlement:", e);
        alert('خطأ في الاتصال بقاعدة البيانات أثناء التسوية. (Transaction Failed)');
        return false;
    }
};


window.showSettleModal = function(user, amount, uid) {
    currentSettleUser = user;
    currentSettleMaxAmount = amount;
    currentSettleRecipientUID = uid;

    let relationText = `تسوية الدين المستحق لـ ${user}`;

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

// ============================================================
// 🔥 منطق شاشة البداية الإعلانية (Splash Screen Logic)
// ============================================================

/**
 * دالة لإخفاء شاشة البداية الإعلانية.
 */
window.hideSplashScreen = function() {
    const splash = document.getElementById('splashScreen');
    if (splash) {
        // 1. إضافة فئة 'hidden' لتبدأ عملية الإخفاء التدريجي (opacity transition)
        splash.classList.add('hidden'); 
        
        // 2. إزالة الشاشة تمامًا بعد انتهاء مدة الانتقال (0.5 ثانية كما في CSS)
        setTimeout(() => {
            splash.style.display = 'none';
        }, 500);
    }
}

// 🔥 تنفيذ الإخفاء عند تحميل محتوى الصفحة 🔥
document.addEventListener('DOMContentLoaded', () => {
    // ربط زر القائمة الجانبية (Sidebar)
    const menuButton = document.getElementById('menuButton');
    if (menuButton) {
        menuButton.addEventListener('click', window.toggleSidebar);
    }
    
    // 🔥🔥 هذا السطر لضمان أن الاسم والبريد يتم تحديثهما فوراً في الشريط الجانبي والهيدر 
    // إذا كانت بيانات المستخدم متوفرة بالفعل.
    window.updateHomeDisplay(); 

    // تشغيل دالة إخفاء الشاشة بعد 3000 ملي ثانية (3 ثواني) - فقط إذا كانت الشاشة موجودة
    if (document.getElementById('splashScreen')) {
        setTimeout(window.hideSplashScreen, 3000); 
    }
    
    // ربط حدث الإرسال لنموذج التسوية
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

            const success = await window.sendSettleTransaction(currentSettleRecipientUID, amount, opNumLastFour);

            if (success) {
                alert(`تم تأكيد دفع ${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG لـ ${currentSettleUser}.`);
                window.hideSettleModal();
            }
        });
    }

});
