// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase
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
    console.error("Firebase Initialization Error:", e);
    alert("خطأ حاسم في تهيئة الاتصال بقاعدة البيانات.");
}

// متغيرات عامة
let allUsers = [];
let currentUserID = null;
let currentUserDB = null;
let allExpenses = [];
let userNotifications = [];
let allSettlements = [];
let netBalances = {};

// متغيرات السجل (History)
let itemsPerPage = 10;
let currentPage = 1;
let activeFilter = '30days';
let filteredHistory = [];
let isLoadingHistory = false; 

// متغيرات الإشعارات
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

window.formatAmountInput = function(input) {
    let value = input.value.replace(/,/g, '').replace(/[^0-9.]/g, '');
    const parts = value.split('.');
    let integerPart = parts[0];
    const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
// ============================================================

function updateHomeDisplay() {
    const balanceEl = document.getElementById('currentBalance');
    const nameEl = document.getElementById('userNamePlaceholder');
    const cardEl = document.getElementById('currentBalanceCard');
    
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarEmail = document.getElementById('sidebarUserEmail');
    const displayHeaderName = document.getElementById('displayHeaderName');
    const displayHeaderEmail = document.getElementById('displayHeaderEmail');

    let displayName = "مستخدم";
    let userEmail = auth.currentUser ? auth.currentUser.email || '' : '';
    
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;

    if (nameEl) nameEl.textContent = displayName;
    if (displayHeaderName) displayHeaderName.textContent = displayName;
    if (sidebarName) sidebarName.textContent = displayName;
    if (displayHeaderEmail) displayHeaderEmail.textContent = userEmail;
    if (sidebarEmail) sidebarEmail.textContent = userEmail;

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
// 💾 منطق حفظ المصروفات
// ============================================================

function calculateShare(amount, participantsCount) {
    if (participantsCount === 0) return 0;
    return roundToTwo(amount / participantsCount);
}

window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value.trim();
    const amountInput = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountInput); 
    const isMessenger = document.getElementById('isMessenger').checked;
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked');

    let selectedParticipantsUids = Array.from(checkboxes).map(cb => cb.dataset.uid);
    selectedParticipantsUids.push(currentUserID);
    selectedParticipantsUids = [...new Set(selectedParticipantsUids)];

    if (!title || isNaN(amount) || amount <= 0 || selectedParticipantsUids.length < 2) {
        alert("يرجى إدخال البيانات كاملة وتحديد مشارك واحد على الأقل.");
        return;
    }

    const share = calculateShare(amount, selectedParticipantsUids.length);

    let finalParticipantsUids = selectedParticipantsUids;
    let finalShare = share;

    if (isMessenger) {
        finalParticipantsUids = selectedParticipantsUids.filter(uid => uid !== currentUserID);
        finalShare = calculateShare(amount, finalParticipantsUids.length);

        if (finalParticipantsUids.length === 0) {
            alert("بصفتك مرسالاً، يجب تحديد مشاركين آخرين.");
            return;
        }
    }

    const participantsNames = finalParticipantsUids.map(uid => getUserNameById(uid)).join('، ');

    let previewHTML = `
        <p><strong>اسم المصروف:</strong> ${title}</p>
        <p><strong>المبلغ الكلي:</strong> ${amount.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG</p>
        <p><strong>الدافع:</strong> ${getUserNameById(currentUserID)}</p>
        <p><strong>المشاركون:</strong> ${participantsNames}</p>
        <p><strong>حصة كل شخص:</strong> ${finalShare.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG</p>
        <p class="mt-4 font-bold text-lg text-blue-600">
            ${isMessenger ? '🔥' : '💰'} حصتك الشخصية: ${isMessenger ? '0.00' : finalShare.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG
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
        const amountDisplay = window.tempExpenseData.amount.toLocaleString('en-US', {minimumFractionDigits: 2}) + ' SDG';
        const messengerWarningP = document.querySelector('#messengerConfirmation .messenger-warning p');
        if(messengerWarningP) messengerWarningP.innerHTML = messengerWarningP.innerHTML.replace('سيظهر هنا', amountDisplay);
    } else {
        window.saveExpense();
    }
};

window.saveExpense = async function() {
    const data = window.tempExpenseData;
    const confirmSaveButton = document.getElementById('confirmSaveButton'); 
    const confirmMessengerButton = document.getElementById('confirmMessengerButton'); 

    if (!data || !currentUserID || !db) return;

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
        await runTransaction(ref(db, `users/${currentUserID}/balance`), (currentBalance) => {
            if (currentBalance === null) return 0 + payerContribution;
            return roundToTwo(currentBalance + payerContribution);
        });

        for (const uid of participantsToDebit) {
            await runTransaction(ref(db, `users/${uid}/balance`), (currentBalance) => {
                if (currentBalance === null) return 0 - data.share;
                return roundToTwo(currentBalance - data.share);
            });

            const newNotifKey = push(ref(db, 'notifications')).key;
            updates[`notifications/${newNotifKey}`] = {
                uid: uid,
                message: `دين جديد: ${data.title}. مطلوب منك ${data.share.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG لـ ${getUserNameById(currentUserID)}.`,
                timestamp: Date.now(),
                is_read: false,
                type: 'debit',
            };
        }

        updates[`expenses/${newExpenseRef.key}`] = expenseRecord;
        await update(ref(db), updates);

        if (currentUserDB) {
            currentUserDB.balance = roundToTwo(currentUserDB.balance + payerContribution);
        }

        window.hideModal();
        document.getElementById('successModal').classList.add('show');
        document.getElementById('expenseForm').reset();
        window.tempExpenseData = null;

    } catch (e) {
        console.error("Error saving expense:", e);
        alert("حدث خطأ أثناء حفظ المصروف.");
    } finally {
        if (confirmSaveButton) {
            confirmSaveButton.disabled = false;
            confirmSaveButton.textContent = 'حفظ'; 
        }
        if (confirmMessengerButton) {
            confirmMessengerButton.disabled = false;
            confirmMessengerButton.textContent = 'موافق (تسجيل كمرسال)'; 
        }
    }
};

// ============================================================
// 📊 منطق المصروفات الشخصية (My Expenses)
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
    ).sort((a, b) => b.timestamp - a.timestamp);

    if (personalList.length === 0) {
        if(noExpensesEl) noExpensesEl.classList.remove('hidden');
        if(totalExpensesEl) totalExpensesEl.textContent = '0.00';
        return;
    }

    if(noExpensesEl) noExpensesEl.classList.add('hidden');

    personalList.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isMessenger = expense.is_messenger || false;
        const share = Number(expense.share);

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
                        - ${displayAmount.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2})} <span class="text-sm font-normal">SDG</span>
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
// 💰 منطق ملخص التسوية (Settlement Summary Logic) ✅ تم الإصلاح
// ============================================================
function calculateNetBalances() {
    if (!currentUserID || allUsers.length === 0) return;

    // تصفير الأرصدة قبل الحساب
    netBalances = {};
    allUsers.forEach(user => {
        if (user.uid !== currentUserID) netBalances[user.uid] = 0;
    });

    // حساب المصروفات
    allExpenses.forEach(expense => {
        const share = Number(expense.share) || 0;
        if (expense.payer_id === currentUserID) {
            // أنا دفعت: الآخرون مدينون لي (رصيدهم عندي يزيد بالموجب +)
            expense.participants_ids.forEach(uid => {
                if (uid !== currentUserID) {
                    netBalances[uid] = Math.round((netBalances[uid] + share) * 100) / 100;
                }
            });
        } else if (expense.participants_ids.includes(currentUserID)) {
            // غيري دفع: أنا مدين له (رصيدي عنده ينقص بالسالب -)
            const payerId = expense.payer_id;
            netBalances[payerId] = Math.round((netBalances[payerId] - share) * 100) / 100;
        }
    });

    // حساب التسويات (السداد)
    allSettlements.forEach(settlement => {
        const amount = Number(settlement.amount) || 0;
        if (settlement.payer_id === currentUserID) {
            // أنا سددت: ديني ينقص (يقترب من الصفر بالموجب +)
            netBalances[settlement.recipient_id] += amount;
        } else if (settlement.recipient_id === currentUserID) {
            // أنا استلمت: حقّي عندهم ينقص (بالسالب -)
            netBalances[settlement.payer_id] -= amount;
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

    // مسح القوائم قبل إعادة العرض
    debtContainer.innerHTML = '';
    claimList.innerHTML = ''; 

    Object.keys(netBalances).forEach(otherUID => {
        const netAmount = netBalances[otherUID];
        const otherUserName = getUserNameById(otherUID);

        if (Math.abs(netAmount) < 0.1) return; // تجاهل المبالغ الصغيرة جداً

        if (netAmount < 0) {
            // عليك دين لهذا الشخص (القيمة سالبة)
            const amount = Math.abs(netAmount);
            totalDebt += amount;
            hasDebtItems = true;

            const debtHTML = `
                <div class="balance-card">
                    <div class="balance-info">
                        <span class="balance-name">${otherUserName}</span>
                        <span class="balance-status text-red-600">يطلبك مبلغ: ${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</span>
                    </div>
                    <button class="action-button" onclick="showSettleModal('${otherUserName}', ${amount}, '${otherUID}')">تسوية المبلغ</button>
                </div>
            `;
            debtContainer.innerHTML += debtHTML;

        } else if (netAmount > 0) {
            // لك مبالغ عند هذا الشخص (القيمة موجبة)
            const amount = netAmount;
            totalCredit += amount;
            hasClaimItems = true;

            const claimHTML = `
                <div class="claim-item">
                    <span class="font-semibold text-gray-800">${otherUserName}: </span>
                    <div class="flex items-center space-x-2 space-x-reverse">
                        <span class="text-green-600 font-bold">${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</span>
                        <button class="nudge-button-individual px-2 py-1 bg-blue-100 text-blue-600 rounded text-xs" onclick="nudgeUser('${otherUserName}', '${otherUID}')">نكز</button>
                    </div>
                </div>
            `;
            claimList.innerHTML += claimHTML;
        }
    });

    // تحديث الأرقام الكلية في المربعات العلوية
    totalDebtEl.innerHTML = `${totalDebt.toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;
    totalCreditEl.innerHTML = `${totalCredit.toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;

    // إظهار أو إخفاء رسالة "لا توجد ديون"
    if (noDebtsEl) {
        if (!hasDebtItems) noDebtsEl.classList.remove('hidden');
        else noDebtsEl.classList.add('hidden');
    }

    // إذا لم تكن هناك مستحقات
    if (!hasClaimItems) {
        claimList.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد مستحقات مالية حالياً.</p>';
    }
}


// ============================================================
// 🔥 منطق سجل العمليات (History Logic) 
// ============================================================

function combineAndSortHistory() {
    const combined = [];
    allExpenses.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);
        if (isPayer && (expense.is_messenger || false) && expense.share < 0.1 && expense.total_amount < 0.1) return;
        if (isPayer || isParticipant) {
            combined.push({ type: 'expense', ...expense, timestamp: expense.timestamp });
        }
    });
    allSettlements.forEach(settlement => {
        if (settlement.payer_id === currentUserID || settlement.recipient_id === currentUserID) {
            combined.push({ type: 'settlement', ...settlement, timestamp: settlement.timestamp });
        }
    });
    return combined.sort((a, b) => b.timestamp - a.timestamp);
}

function filterHistory(filter) {
    const allHistory = combineAndSortHistory();
    const now = Date.now();

    filteredHistory = allHistory.filter(record => {
        if (filter === '30days') return record.timestamp >= now - (30 * 24 * 60 * 60 * 1000);
        if (filter === '3months') return record.timestamp >= now - (90 * 24 * 60 * 60 * 1000);
        if (filter === 'incoming') {
            const isPayer = record.payer_id === currentUserID;
            if (record.type === 'expense' && isPayer && (record.total_amount - (record.share || 0)) > 0.1) return true;
            if (record.type === 'expense' && isPayer && (record.is_messenger || false)) return true; 
            if (record.type === 'settlement' && record.recipient_id === currentUserID) return true;
            return false;
        }
        if (filter === 'outgoing') {
            if (record.type === 'expense' && record.participants_ids.includes(currentUserID) && record.payer_id !== currentUserID) return true;
            if (record.type === 'settlement' && record.payer_id === currentUserID) return true;
            return false;
        }
        return true;
    });
}

function displayHistory(isAppending = false) {
    const container = document.getElementById('expensesContainer');
    if (!container || isLoadingHistory) return;

    isLoadingHistory = true;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = currentPage * itemsPerPage;
    const recordsToShow = filteredHistory.slice(startIndex, endIndex);

    if (currentPage === 1 && !isAppending) container.innerHTML = '';

    if (recordsToShow.length === 0 && currentPage === 1) {
        container.innerHTML = `<p class="text-center text-gray-500 mt-12 py-10">لا توجد سجلات معاملات.</p>`;
        isLoadingHistory = false;
        return;
    }
    
    const loadingIndicator = document.getElementById('historyLoadingIndicator');
    if (loadingIndicator && isAppending) loadingIndicator.classList.remove('hidden');

    recordsToShow.forEach(record => {
        let cardHTML = '';
        const { date, time } = formatBankDate(record.timestamp);

        if (record.type === 'expense') {
            const isPayer = record.payer_id === currentUserID;
            const payerName = getUserNameById(record.payer_id);
            const share = Number(record.share || 0);
            let iconClass = 'icon-danger', amountClass = 'amount-neg', amountText = '0.00', mainTitle = '', subTitle = `الكلي: ${record.total_amount.toLocaleString()} SDG`, iconBadge = 'fa-arrow-down text-red-500';

            if (isPayer) {
                const amountClaimed = (record.is_messenger || false) ? record.total_amount : roundToTwo(record.total_amount - share);
                if (amountClaimed > 0.1) {
                    amountText = `+ ${amountClaimed.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                    iconClass = 'icon-success'; amountClass = 'amount-pos'; iconBadge = 'fa-arrow-up text-green-500';
                    mainTitle = (record.is_messenger || false) ? `دفعة لك (كمرسال) عن: ${record.title}` : `دفعة لك عن: ${record.title}`;
                } else return;
            } else {
                if (share > 0.1) {
                    amountText = `- ${share.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                    mainTitle = `دين عليك لـ ${payerName} في: ${record.title}`;
                } else return;
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
                        <div class="amount-display ${amountClass}">${amountText} <span class="text-sm font-normal">SDG</span></div>
                    </div>
                    <div class="card-footer-date"><span>${date}</span><span>${time}</span></div>
                </div>`;
        } else if (record.type === 'settlement') {
            const isPayer = record.payer_id === currentUserID;
            const otherUserName = isPayer ? getUserNameById(record.recipient_id) : getUserNameById(record.payer_id);
            const amount = Number(record.amount);
            
            cardHTML = `
                <div class="bankak-card">
                    <div class="card-main-content">
                        <div class="details-wrapper">
                            <div class="bank-icon-container ${isPayer ? 'icon-danger' : 'icon-success'} ml-3">
                                <i class="fas fa-handshake"></i>
                            </div>
                            <div class="details-text text-right">
                                <p class="transaction-title">${isPayer ? 'تسوية دفعتها لـ' : 'تسوية استلمتها من'} ${otherUserName}</p>
                                <p class="transaction-sub">رقم العملية: ${record.operation_number}</p>
                            </div>
                        </div>
                        <div class="amount-display ${isPayer ? 'amount-neg' : 'amount-pos'}">
                            ${isPayer ? '-' : '+'} ${amount.toLocaleString()} <span class="text-sm font-normal">SDG</span>
                        </div>
                    </div>
                    <div class="card-footer-date"><span>${date}</span><span>${time}</span></div>
                </div>`;
        }
        container.innerHTML += cardHTML;
    });

    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    isLoadingHistory = false;
}

window.setFilter = function(filter, element) {
    document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    activeFilter = filter;
    currentPage = 1;
    const container = document.getElementById('expensesContainer');
    if (container) container.innerHTML = '<p class="text-center">جاري التحميل...</p>';
    filterHistory(activeFilter);
    displayHistory();
};

function checkScrollForMoreHistory() {
    if (!document.getElementById('expensesContainer')) return;
    if (isLoadingHistory || currentPage * itemsPerPage >= filteredHistory.length) return;
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 300) {
        currentPage++;
        displayHistory(true);
    }
}

// ============================================================
// 🔔 منطق الإشعارات
// ============================================================

function loadNotifications() {
    if (!currentUserID || !db) return;
    onValue(ref(db, 'notifications'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            userNotifications = Object.keys(val)
                .map(key => ({ id: key, ...val[key] }))
                .filter(n => n.uid === currentUserID)
                .sort((a, b) => b.timestamp - a.timestamp); 
            currentNotificationPage = 1; 
            const notificationModal = document.getElementById('notificationModal');
            if (notificationModal && notificationModal.classList.contains('show')) displayNotifications();
            else updateNotificationBadge();
        } else {
            userNotifications = [];
            updateNotificationBadge();
            displayNotifications();
        }
    });
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    const unreadCount = userNotifications.filter(n => !n.is_read).length;
    badge.textContent = unreadCount.toString();
    badge.classList.toggle('hidden', unreadCount === 0);
}

function displayNotifications(isAppending = false) {
    const listContainer = document.getElementById('notificationsList');
    if (!listContainer || isLoadingNotifications) return;

    isLoadingNotifications = true;
    const startIndex = (currentNotificationPage - 1) * notificationsPerPage;
    const endIndex = currentNotificationPage * notificationsPerPage;
    const notificationsToShow = userNotifications.slice(startIndex, endIndex);

    if (currentNotificationPage === 1 && !isAppending) listContainer.innerHTML = '';
    updateNotificationBadge();

    if (notificationsToShow.length === 0 && currentNotificationPage === 1) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد إشعارات.</p>';
        isLoadingNotifications = false;
        return;
    }

    notificationsToShow.forEach(notification => {
        const statusClass = notification.is_read ? 'text-gray-500 bg-gray-50' : 'font-semibold bg-blue-50 hover:bg-blue-100';
        const { date, time } = formatBankDate(notification.timestamp);
        listContainer.innerHTML += `
            <div class="p-3 rounded-lg border cursor-pointer transition ${statusClass}" onclick="markNotificationAsRead('${notification.id}')">
                <p>${notification.message}</p>
                <p class="text-xs mt-1 text-gray-400">${time} - ${date}</p>
            </div>`;
    });
    isLoadingNotifications = false;
}

window.markNotificationAsRead = async function(notificationId) {
    if(!db) return;
    try { await update(ref(db, `notifications/${notificationId}`), { is_read: true }); } 
    catch(e) { console.error(e); }
};

function checkScrollForMoreNotifications() {
    const modalContent = document.querySelector('#notificationModal .modal-content-inner');
    if (!modalContent || isLoadingNotifications || currentNotificationPage * notificationsPerPage >= userNotifications.length) return;
    if (modalContent.scrollTop + modalContent.clientHeight >= modalContent.scrollHeight - 50) {
        currentNotificationPage++;
        displayNotifications(true);
    }
}

// ============================================================
// 💾 دوال المودال
// ============================================================

window.hideModal = () => {
    document.getElementById('previewModal').classList.remove('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';
};
window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');
window.showNotifications = () => {
    const modal = document.getElementById('notificationModal');
    if (!modal) return;
    modal.classList.add('show');
    currentNotificationPage = 1;
    displayNotifications();
    const modalInner = document.querySelector('#notificationModal .modal-content-inner');
    if (modalInner) {
        modalInner.removeEventListener('scroll', checkScrollForMoreNotifications);
        modalInner.addEventListener('scroll', checkScrollForMoreNotifications);
    }
};
window.hideNotificationModal = () => {
    const modal = document.getElementById('notificationModal');
    if (modal) modal.classList.remove('show');
};

// ============================================================
// 🔄 تحميل البيانات (Load Data) ✅ تم الإصلاح
// ============================================================

// دالة مساعدة لتحديث الصفحة الحالية بذكاء بدلاً من الاعتماد على URL
function refreshCurrentPageData() {
    if (document.getElementById('debtContainer')) {
        calculateNetBalances(); 
        updateSummaryDisplay(); 
    }
    if (document.getElementById('expensesContainer')) {
        currentPage = 1; 
        filterHistory(activeFilter);
        displayHistory();
    }
    if (document.getElementById('personalExpensesContainer')) {
        displayPersonalExpenses();
    }
}

function loadData() {
    if (!currentUserID || !db) return;

    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            updateHomeDisplay(); 
            populateParticipants();
        }
    });

    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);
        } else {
            allExpenses = [];
        }
        refreshCurrentPageData(); // 🔥 تحديث ذكي
    });

    onValue(ref(db, 'settlements'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allSettlements = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] }));
        } else {
            allSettlements = [];
        }
        refreshCurrentPageData(); // 🔥 تحديث ذكي عند وصول تسوية
    });

    loadNotifications();
}

// ============================================================
// 🔐 المصادقة والبداية
// ============================================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();
        updateHomeDisplay(); 
        window.addEventListener('scroll', checkScrollForMoreHistory);
        const logoutSidebarBtn = document.getElementById('logoutSidebarButton');
        if (logoutSidebarBtn) logoutSidebarBtn.onclick = () => auth.signOut().then(() => window.location.href = 'auth.html');
    } else {
        window.removeEventListener('scroll', checkScrollForMoreHistory);
        if (!window.location.href.includes('auth.html')) window.location.href = 'auth.html';
    }
});

// ============================================================
// 💰 منطق التسوية (Settle Logic) ✅ تم الإصلاح
// ============================================================

window.sendSettleTransaction = async function(recipientUID, amountInput, opNumber) {
    const amount = parseFloat(amountInput); // 🔥 تحويل إجباري للرقم

    if (!currentUserID || !recipientUID || isNaN(amount) || amount <= 0 || !db) {
        alert("خطأ في بيانات التسوية.");
        return false;
    }

    const payerName = getUserNameById(currentUserID);
    const updates = {};
    const newSettleRef = push(ref(db, 'settlements'));

    try {
        // تحديث رصيد الدافع (أنت)
        await runTransaction(ref(db, `users/${currentUserID}/balance`), (currentBalance) => {
            return roundToTwo((currentBalance || 0) + amount);
        });

        // تحديث رصيد المستلم
        await runTransaction(ref(db, `users/${recipientUID}/balance`), (currentBalance) => {
            return roundToTwo((currentBalance || 0) - amount);
        });

        // إضافة سجل التسوية
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
        alert('فشلت عملية التسوية في قاعدة البيانات.');
        return false;
    }
};

window.showSettleModal = function(user, amount, uid) {
    currentSettleUser = user;
    currentSettleMaxAmount = amount;
    currentSettleRecipientUID = uid;

    const settleRelationEl = document.getElementById('settleRelation');
    const maxSettleAmountDisplayEl = document.getElementById('maxSettleAmountDisplay');
    const settleAmountInputEl = document.getElementById('settleAmount');
    const settleModalEl = document.getElementById('settleModal');

    if (settleRelationEl) settleRelationEl.textContent = `تسوية الدين المستحق لـ ${user}`;
    if (maxSettleAmountDisplayEl) maxSettleAmountDisplayEl.textContent = amount.toLocaleString(undefined, {minimumFractionDigits: 2});
    if (settleAmountInputEl) {
        settleAmountInputEl.setAttribute('max', amount);
        settleAmountInputEl.value = amount;
    }
    if (settleModalEl) settleModalEl.classList.add('show');
}

window.hideSettleModal = function() {
    const settleModalEl = document.getElementById('settleModal');
    if(settleModalEl) settleModalEl.classList.remove('show');
    const settleForm = document.getElementById('settleForm');
    if(settleForm) settleForm.reset();
    currentSettleUser = ''; currentSettleMaxAmount = 0; currentSettleRecipientUID = '';
}

// ============================================================
// 🔥 منطق واجهة المستخدم العامة
// ============================================================

window.hideSplashScreen = function() {
    const splash = document.getElementById('splashScreen');
    if (splash) {
        splash.classList.add('hidden'); 
        setTimeout(() => splash.style.display = 'none', 500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const menuButton = document.getElementById('menuButton');
    if (menuButton) menuButton.addEventListener('click', window.toggleSidebar);
    window.updateHomeDisplay(); 
    if (document.getElementById('splashScreen')) setTimeout(window.hideSplashScreen, 3000); 
    
    const settleFormEl = document.getElementById('settleForm');
    if(settleFormEl) {
        settleFormEl.addEventListener('submit', async function(e) {
            e.preventDefault();
            const operationNumber = document.getElementById('operationNumber').value;
            // 🔥 قراءة القيمة الخام والتأكد من أنها رقم
            const amount = parseFloat(document.getElementById('settleAmount').value.replace(/,/g, ''));
            
            if (operationNumber.length < 4) {
                alert("يرجى إدخال رقم عملية صحيح.");
                return;
            }
            if (amount <= 0 || amount > currentSettleMaxAmount + 0.1 || !currentSettleRecipientUID) {
                alert("بيانات المبلغ غير صحيحة.");
                return;
            }

            const success = await window.sendSettleTransaction(currentSettleRecipientUID, amount, operationNumber);
            if (success) {
                alert(`تم تأكيد دفع ${amount.toLocaleString()} SDG.`);
                window.hideSettleModal();
            }
        });
    }
});