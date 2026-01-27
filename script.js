هذا الزر من المفترض ان يقوم بحل مشكلة الضغط المزدوج 
واكن اوقف كل شي 



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

// 🔥 متغيرات خاصة بسجل العمليات (History) 🔥
let itemsPerPage = 10;
let currentPage = 1;
let activeFilter = '30days';
let filteredHistory = []; // قائمة السجلات المدمجة والمفلترة
let isLoadingHistory = false; // 🔄 مؤشر لمنع التحميل المتكرر للسجلات

// 🔥 متغيرات خاصة بالإشعارات (Notifications) 🔥
let notificationsPerPage = 10;
let currentNotificationPage = 1;
let isLoadingNotifications = false; // 🔄 مؤشر لمنع التحميل المتكرر للإشعارات
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

// 🔥 الدالة النهائية لحفظ المصروف وتحديث الأرصدة - تم تعديلها لمنع الضغط المزدوج
window.saveExpense = async function() {
    const data = window.tempExpenseData;
    
    // 🛑 البحث عن الأزرار
    const confirmSaveButton = document.getElementById('confirmSaveButton'); // زر الحفظ العادي
    const confirmMessengerButton = document.getElementById('confirmMessengerButton'); // زر المرسال

    // 1. التحقق من البيانات
    if (!data || !currentUserID || !db) return;

    // 2. 🛡️ تعطيل الأزرار لمنع الضغط المزدوج (Double Submission)
    if (confirmSaveButton) {
        confirmSaveButton.disabled = true;
        confirmSaveButton.textContent = 'جاري الحفظ...'; // تغيير النص لإظهار حالة التحميل (اختياري)
    }
    if (confirmMessengerButton) {
        confirmMessengerButton.disabled = true;
        confirmMessengerButton.textContent = 'جاري التسجيل...'; // تغيير النص (اختياري)
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

    } catch (e) {
        console.error("Error saving expense and updating balances:", e);
        alert("حدث خطأ أثناء حفظ المصروف. الرجاء المحاولة مرة أخرى.");
    } finally {
        // 5. 🟢 إعادة تمكين الأزرار وتحديث نصها (سواء نجح الحفظ أو فشل)
        if (confirmSaveButton) {
            confirmSaveButton.disabled = false;
            confirmSaveButton.textContent = 'حفظ المصروف'; // إعادة النص الأصلي
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
    // ✨ التعديل الحاسم: تطبيق تأثير التسويات على الأرصدة الصافية
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
// 🔥 منطق سجل العمليات (History Logic) - تم تحديثه
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
        // ... (منطق التصفية لم يتغير)
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

        // ... (منطق بناء بطاقة السجل لم يتغير)
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
// 🔔 منطق الإشعارات (Notifications Logic) - تم تعديله 🔥
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
            displayNotifications();
        } else {
            userNotifications = [];
            displayNotifications();
        }
    });
}

/**
 * دالة عرض الإشعارات مع دعم التحميل التزايدي (Lazy Loading)
 */
function displayNotifications(isAppending = false) {
    const listContainer = document.getElementById('notificationsList');
    const badge = document.getElementById('notificationBadge');

    if (!listContainer || !badge || isLoadingNotifications) return;

    isLoadingNotifications = true;

    const startIndex = (currentNotificationPage - 1) * notificationsPerPage;
    const endIndex = currentNotificationPage * notificationsPerPage;
    const notificationsToShow = userNotifications.slice(startIndex, endIndex);

    if (currentNotificationPage === 1 && !isAppending) {
        listContainer.innerHTML = ''; // إفراغ الحاوية عند التحميل لأول مرة
    }

    const unreadCount = userNotifications.filter(n => !n.is_read).length;
    badge.textContent = unreadCount.toString();
    if (unreadCount > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    if (notificationsToShow.length === 0 && currentNotificationPage === 1) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد إشعارات حالياً.</p>';
        isLoadingNotifications = false;
        return;
    }
    
    // 🔥 عرض مؤشر التحميل الخاص بالإشعارات (مؤشر وهمي هنا لعدم وجوده في HTML المقدم)
    // const notifLoadingIndicator = document.getElementById('notificationLoadingIndicator');
    // if (notifLoadingIndicator && isAppending) {
    //     notifLoadingIndicator.classList.remove('hidden');
    // }


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

    // if (notifLoadingIndicator) notifLoadingIndicator.classList.add('hidden'); // إخفاء مؤشر التحميل
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
    const scrollThreshold = 50; // عتبة أصغر لأن المودال أصغر

    if (scrollPosition >= contentHeight - scrollThreshold) {
        currentNotificationPage++;
        displayNotifications(true);
    }
}


// ============================================================
// 💾 دوال إخفاء المودال (مختصرة للعرض) - تم تعديلها 🔥
// ============================================================

window.hideModal = () => {
    document.getElementById('previewModal').classList.remove('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';
};

window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');

window.showNotifications = () => {
    const modal = document.getElementById('notificationModal');
    // تم تعديل هذا السطر ليستخدم div الـ "list" مباشرة بدلاً من content-inner الذي لم يكن موجودًا في HTML المقدم
    const listContainer = document.getElementById('notificationsList'); 
    
    // عند فتح المودال، نربط مستمع التمرير الخاص بالإشعارات
    if (listContainer) {
        listContainer.addEventListener('scroll', checkScrollForMoreNotifications);
        // نعيد تحميل الصفحة الأولى لضمان عرض أحدث الإشعارات
        currentNotificationPage = 1;
        displayNotifications();
    }
    if (modal) modal.classList.add('show');
};

window.hideNotificationModal = () => {
    const modal = document.getElementById('notificationModal');
    // تم تعديل هذا السطر ليستخدم div الـ "list" مباشرة
    const listContainer = document.getElementById('notificationsList');
    
    // عند إغلاق المودال، نزيل مستمع التمرير
    if (listContainer) {
        listContainer.removeEventListener('scroll', checkScrollForMoreNotifications);
    }
    if (modal) modal.classList.remove('show');
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
// 🔐 المصادقة والبداية (Entry Point) - تم تعديله 🔥
// ============================================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;

        // ... (تحديث معلومات الشريط الجانبي والهيدر) ...

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


// ... (باقي الدوال الخاصة بالتسوية والمودالات لم يتم تعديلها باستثناء الإشعارات) ...


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

    const newCurrentUserBalance = roundToTwo(currentPayerUser.balance + amount);
    updates[`users/${currentUserID}/balance`] = newCurrentUserBalance;

    const newRecipientBalance = roundToTwo(recipientUser.balance - amount);
    updates[`users/${recipientUID}/balance`] = newRecipientBalance;

    const newSettleKey = push(ref(db, 'settlements')).key;
    updates[`settlements/${newSettleKey}`] = {
        payer_id: currentUserID,
        recipient_id: recipientUID,
        amount: amount,
        operation_number: opNumber,
        timestamp: Date.now()
    };

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
// 🔥 منطق شاشة البداية الإعلانية (Splash Screen Logic) - إضافة جديدة 🔥
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

    // تشغيل دالة إخفاء الشاشة بعد 3000 ملي ثانية (3 ثواني)
    setTimeout(window.hideSplashScreen, 3000); 
    
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









































Index


<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>الرئيسية - إضافة مصروف - Smart Dorm Expenses</title>
<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
<style>
/* CSS: الأنماط الأساسية (المستعادة من تصميمك) */
body {
    background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    /* الحفاظ على المسافة من الأعلى بسبب شريط التنقل الثابت */
    padding-top: 64px; 
}

/* شريط التنقل */
.navbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 900;
    background-color: white;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
    height: 64px; /* تحديد ارتفاع ثابت */
    padding: 0 16px;
}
/* --- أنماط القائمة الجانبية (Sidebar) --- */
.sidebar {
    position: fixed;
    top: 0;
    right: 0; /* في وضع RTL تظهر القائمة من اليمين */
    height: 100%;
    width: 250px;
    background: white;
    z-index: 1000;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
    transform: translateX(100%); /* إخفاء القائمة في البداية */
    transition: transform 0.3s ease-out;
    padding-top: 64px;
}
.sidebar.open {
    transform: translateX(0); /* إظهار القائمة */
}
.sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
}
.sidebar.open + .sidebar-overlay {
    display: block;
}
.sidebar-link {
    display: block;
    padding: 15px 20px;
    font-weight: 600;
    color: #4B5563;
    transition: background-color 0.3s, color 0.3s;
    border-right: 4px solid transparent; /* خط التحديد لليمين */
}
.sidebar-link:hover {
    background-color: #F3F4F6;
    color: #3B82F6;
}
.sidebar-link.active {
    color: #1D4ED8;
    background-color: #EBF5FF;
    border-right-color: #1D4ED8;
}
/* النمط الجديد لقص النص الزائد */
.sidebar-profile-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}
/* نهاية أنماط القائمة الجانبية */
/* الحاوية الرئيسية */
.content-wrapper {
    flex-grow: 1;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 20px;
}
.container {
    background: white;
    border-radius: 20px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
    padding: 40px;
    max-width: 600px;
    width: 100%;
    margin-top: 20px;
    position: relative;
}
/* الأزرار العلوية */
.top-actions {
    position: absolute;
    top: -50px;
    right: 20px;
    display: flex;
    gap: 10px;
    z-index: 10;
}
/* --- بطاقة الرصيد --- */
.balance-card {
    /* الحالة الافتراضية (موجب - أخضر) */
    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    color: white;
    padding: 20px;
    border-radius: 15px;
    text-align: center;
    margin-bottom: 30px;
    box-shadow: 0 10px 30px rgba(16, 185, 129, 0.3);
    transition: background 0.5s ease;
}
/* الحالة السالبة (دين - أحمر) */
.balance-card.negative {
    background: linear-gradient(135deg, #EF4444 0%, #B91C1C 100%) !important;
    box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);
}
.balance-card h3 {
    font-size: 18px;
    margin-bottom: 5px;
    opacity: 0.9;
}
.balance-card p {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: 1px;
}
/* الحقول والنماذج */
.form-group {
    margin-bottom: 25px;
}
.form-group label {
    display: block;
    font-weight: 600;
    color: #374151;
    margin-bottom: 8px;
}
.form-group input, .form-group select {
    width: 100%;
    padding: 15px;
    border: 2px solid #E5E7EB;
    border-radius: 12px;
    background: #F9FAFB;
    font-size: 16px;
}
.form-group input:focus, .form-group select:focus {
    border-color: #3B82F6;
    background: white;
    outline: none;
}
/* Checkboxes */
.checkbox-group {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
}
.checkbox-item {
    display: flex;
    align-items: center;
    background: #F3F4F6;
    padding: 12px 15px;
    border-radius: 10px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: 0.3s;
}
.checkbox-item:hover {
    background: #E5E7EB;
    border-color: #3B82F6;
}
.checkbox-item input {
    margin-left: 10px;
    width: auto;
}
.select-all {
    background: #3B82F6;
    color: white;
    padding: 10px;
    border-radius: 10px;
    cursor: pointer;
    text-align: center;
    margin-bottom: 15px;
}
/* الأزرار */
.btn {
    background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
    color: white;
    padding: 15px 30px;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    width: 100%;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
}
.btn-secondary {
    background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
}
/* Modals */
.modal {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    align-items: center;
    justify-content: center;
    z-index: 1000;
}
.modal.show {
    display: flex;
}
.modal-content {
    background: white;
    padding: 30px;
    border-radius: 20px;
    width: 90%;
    max-width: 400px;
    text-align: center;
}
/* رسالة تحذير المرسال */
.warning {
    background: #F59E0B;
    color: white;
    padding: 10px;
    border-radius: 8px;
    margin-bottom: 15px;
    display: none;
}
.messenger-warning {
    background: #FEF2F2;
    color: #B91C1C;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 15px;
    border: 1px solid #FCA5A5;
    text-align: right;
}
/* إخفاء المحتوى الافتراضي في المودال في البداية */
#previewDetails {
    display: block;
}
#messengerConfirmation {
    display: none;
}
/* أنماط الإشعارات */
.max-h-96 {
    max-height: 24rem;
}
</style>
</head>
<body>

<nav class="navbar">
    <div class="max-w-6xl mx-auto px-4 h-full">
        <div class="flex justify-between items-center h-full">
            <button id="menuButton" class="text-2xl text-gray-600 hover:text-blue-500 p-2 focus:outline-none">
                <i class="fas fa-bars"></i>
            </button>
            <div class="text-2xl font-extrabold text-blue-600 absolute right-1/2 transform translate-x-1/2 hidden sm:block">
                <i class="fas fa-home"></i> Smart Dorm
            </div>
            <div class="flex items-center">
                <button id="notificationButton" class="relative text-gray-500 hover:text-red-500 p-2 focus:outline-none" onclick="showNotifications()">
                    <i class="fas fa-bell text-2xl"></i>
                    <span id="notificationBadge" class="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full hidden">
                        0
                    </span>
                </button>
            </div>
        </div>
    </div>
</nav>
<div id="sidebar" class="sidebar">
    <div class="p-4 border-b">
        <h3 class="text-lg font-bold text-gray-800 sidebar-profile-text" id="sidebarUserName">جاري التحميل...</h3>
        <p class="text-sm text-gray-500 sidebar-profile-text" id="sidebarUserEmail">...</p>
    </div>
    <a href="index.html" class="sidebar-link active"><i class="fas fa-plus-circle ml-2"></i> إضافة مصروف</a>
    <a href="my_expenses.html" class="sidebar-link"><i class="fas fa-file-invoice-dollar ml-2"></i> مصروفاتي</a>
    <a href="history.html" class="sidebar-link"><i class="fas fa-history ml-2"></i> السجل</a>
    <a href="summary.html" class="sidebar-link"><i class="fas fa-handshake ml-2"></i> تسوية الأرصدة</a>
    <a href="auth.html" id="logoutSidebarButton" class="sidebar-link text-red-600 hover:text-red-800 mt-4">
        <i class="fas fa-sign-out-alt ml-2"></i> خروج
    </a>
</div>
<div id="sidebarOverlay" class="sidebar-overlay" onclick="closeSidebar()"></div>
<div class="content-wrapper">
    <div class="container">
        <div class="text-center text-gray-500 text-sm mb-6 italic">
            <i class="fas fa-wallet"></i> نظام إدارة مصروفات السكن الذكي
        </div>
        <div id="currentBalanceCard" class="balance-card">
            <h3> 
                <i class="fas fa-user-circle ml-1"></i> مرحباً، <span id="userNamePlaceholder" class="font-bold underline">...</span> 
            </h3>
            <p dir="ltr">
                <span id="currentBalance">جاري التحميل...</span>
                <span class="text-lg font-normal">SDG</span>
            </p>
        </div>
        <h1 class="text-2xl font-bold text-center text-gray-800 mb-6"> إضافة مصروف جديد </h1>
        <form id="expenseForm">
            <div class="form-group">
                <label for="expenseTitle">اسم المصروف</label>
                <input type="text" id="expenseTitle" placeholder="مثال: عشاء، كهرباء..." list="suggestions" required>
                <datalist id="suggestions">
                    <option value="أكل">
                    <option value="شرب">
                    <option value="كهرباء">
                    <option value="نظافة">
                </datalist>
            </div>
            <div class="form-group flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                <label for="isMessenger" class="text-sm font-semibold text-red-700 select-none cursor-pointer">
                    <i class="fas fa-hand-holding-usd ml-1"></i> دفعت كمُرسال (لست مشاركاً)
                </label>
                <input type="checkbox" id="isMessenger" class="form-checkbox h-5 w-5 text-red-600">
            </div>
            <div class="form-group">
                <label for="expenseAmount">المبلغ الكلي (SDG)</label>
                <input type="tel" id="expenseAmount" placeholder="مثال: 5,000" oninput="formatNumber(this)" required style="direction: ltr; text-align: right;">
            </div>
            <div class="form-group mt-6">
                <label>المشاركون (من سيقتسمون المبلغ)</label>
                <div class="select-all" onclick="selectAllParticipants()">تحديد الجميع</div>
                <div class="checkbox-group" id="participantsCheckboxes">
                </div>
            </div>
            <button type="button" onclick="previewExpense()" class="btn btn-secondary"> معاينة وحفظ </button>
        </form>
    </div>
</div>
<div id="previewModal" class="modal">
    <div class="modal-content">
        <div id="previewDetails">
            <div id="warning" class="warning"><i class="fas fa-exclamation-triangle"></i> تحذير: مصروف مكرر!</div>
            <h2 class="text-xl font-bold mb-4">تأكيد المصروف</h2>
            <div id="previewText" class="text-right text-gray-700 mb-6 text-sm leading-loose"></div>
            <div class="flex justify-center gap-4">
                <button id="confirmSaveButton" onclick="window.handleSaveClick(this)" class="btn w-auto">حفظ</button>
                <button onclick="hideModal()" class="btn w-auto bg-gray-500 text-white">إلغاء</button>
            </div>
        </div>
        <div id="messengerConfirmation">
            <div class="messenger-warning">
                <h3 class="font-extrabold mb-2 text-xl"><i class="fas fa-exclamation-triangle ml-1"></i> تنبيه هام: وضع المرسال!</h3>
                <p class="text-base leading-relaxed"> 
                    أنت على وشك تسجيل المصروف كـ **مُرسال**. هذا يعني أنك دفعت المبلغ (سيظهر هنا) بالنيابة عن المشاركين، وحصتك ستكون **صفراً**.
                </p>
                <p class="mt-2 font-bold"> هل أنت متأكد من المتابعة بتسجيل المصروف كـ مُرسال؟ </p>
            </div>
            <div class="flex justify-center gap-4">
                <button id="confirmMessengerButton" onclick="window.saveExpense(this)" class="btn w-auto bg-red-600 hover:bg-red-700">موافق (تسجيل كمرسال)</button>
                <button onclick="hideModal()" class="btn w-auto bg-gray-500 text-white">إلغاء</button>
            </div>
        </div>
    </div>
</div>
<div id="successModal" class="modal">
    <div class="modal-content">
        <h2 class="text-xl font-bold text-green-600 mb-4"><i class="fas fa-check-circle"></i> تم الحفظ!</h2>
        <button onclick="hideSuccessModal()" class="btn w-full">إغلاق</button>
    </div>
</div>
<div id="notificationModal" class="modal">
    <div class="modal-content max-w-md text-right">
        <h2 class="text-xl font-bold mb-4 border-b pb-2"><i class="fas fa-bell ml-1"></i> الإشعارات</h2>
        <div id="notificationsList" class="space-y-3 text-sm max-h-96 overflow-y-auto modal-content-inner">
        </div>
        <button onclick="hideNotificationModal()" class="btn w-full mt-6 bg-gray-500 text-white">إغلاق</button>
    </div>
</div>
<script>
    window.toggleSidebar = function() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('open');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : 'auto';
    }
    window.closeSidebar = function() {
        document.getElementById('sidebar').classList.remove('open');
        document.body.style.overflow = 'auto';
    }
    // ملاحظة: تم إزالة الكود الخاص بشاشة البداية من ملف script.js (إذا كان موجودًا)
    // الآن، سيتم تحميل الصفحة مباشرة دون أي تأخير.
</script>
<script src="script.js" type="module"></script>
</body>
</html>