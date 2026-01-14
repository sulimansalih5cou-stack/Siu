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

// ✅ تحسين تنسيق المبلغ مع الفواصل أثناء الكتابة
window.formatAmountInput = function(input) {
    let value = input.value.replace(/,/g, '').replace(/[^0-9.]/g, '');
    if (value === "") return;
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
                <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-5 w-5 text-blue-600 participant-cb" onchange="window.handleCheckboxChange(this)">
                <span class="mr-2 font-semibold text-gray-700 select-none">${user.displayName}</span>
            </label>
        `;
        container.appendChild(div);
    });
}

// ✅ منطق زر "تسجيل مصروف شخصي" (بدلاً من تحديد الجميع)
window.togglePersonalExpense = function() {
    const isPersonalBtn = document.getElementById('personalExpenseBtn');
    const isMessenger = document.getElementById('isMessenger').checked;

    if (isMessenger) {
        alert("⚠️ لا يمكن اختيار 'مصروف شخصي' عند التفعيل كمرسال.");
        return;
    }

    const checkboxes = document.querySelectorAll('.participant-cb');
    const isAlreadyPersonal = isPersonalBtn.classList.contains('active-personal');

    if (!isAlreadyPersonal) {
        // تفعيل الوضع الشخصي: إلغاء تحديد الجميع
        checkboxes.forEach(cb => {
            cb.checked = false;
            cb.disabled = true;
        });
        isPersonalBtn.classList.add('active-personal', 'bg-orange-500', 'text-white');
        isPersonalBtn.textContent = 'إلغاء المصروف الشخصي';
    } else {
        // إلغاء الوضع الشخصي
        checkboxes.forEach(cb => cb.disabled = false);
        isPersonalBtn.classList.remove('active-personal', 'bg-orange-500', 'text-white');
        isPersonalBtn.textContent = 'تسجيل مصروف شخصي (أنا فقط)';
    }
};

// منع اختيار مشاركين إذا كان الوضع شخصي
window.handleCheckboxChange = function(cb) {
    const isPersonal = document.getElementById('personalExpenseBtn').classList.contains('active-personal');
    if (isPersonal) {
        cb.checked = false;
        alert("⚠️ أنت في وضع 'المصروف الشخصي'. ألغِ الوضع أولاً لتحديد مشاركين.");
    }
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
    const isPersonal = document.getElementById('personalExpenseBtn').classList.contains('active-personal');
    const checkboxes = document.querySelectorAll('.participant-cb:checked');

    let selectedParticipantsUids = Array.from(checkboxes).map(cb => cb.dataset.uid);
    
    // إذا لم يكن مرسالاً، أضف المستخدم الحالي دائماً
    if (!isMessenger) {
        selectedParticipantsUids.push(currentUserID);
    }
    selectedParticipantsUids = [...new Set(selectedParticipantsUids)];

    // التحقق من المدخلات
    if (!title || isNaN(amount) || amount <= 0) {
        alert("يرجى إدخال البيانات كاملة.");
        return;
    }

    if (!isPersonal && !isMessenger && selectedParticipantsUids.length < 2) {
        alert("يرجى تحديد مشارك واحد على الأقل أو اختيار 'مصروف شخصي'.");
        return;
    }

    const share = calculateShare(amount, selectedParticipantsUids.length);
    let finalParticipantsUids = selectedParticipantsUids;
    let finalShare = share;

    if (isMessenger) {
        if (selectedParticipantsUids.length === 0) {
            alert("بصفتك مرسالاً، يجب تحديد مشاركين آخرين.");
            return;
        }
    }

    const participantsNames = isPersonal ? "أنا فقط (مصروف شخصي)" : finalParticipantsUids.map(uid => getUserNameById(uid)).join('، ');

    let previewHTML = `
        <div class="p-4 bg-blue-50 rounded-lg mb-4 text-right">
            <p class="mb-2"><strong><i class="fas fa-tag ml-1"></i> اسم المصروف:</strong> ${title}</p>
            <p class="mb-2"><strong><i class="fas fa-money-bill-wave ml-1"></i> المبلغ:</strong> ${amount.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG</p>
            <p class="mb-2"><strong><i class="fas fa-users ml-1"></i> المشاركون:</strong> ${participantsNames}</p>
            <hr class="my-2">
            <p class="font-bold text-lg text-blue-700">
                ${isMessenger ? '🔥' : '💰'} حصتك الشخصية: ${isMessenger || isPersonal ? '0.00' : finalShare.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG
            </p>
        </div>
    `;

    document.getElementById('previewText').innerHTML = previewHTML;

    window.tempExpenseData = {
        title: title,
        amount: amount,
        share: finalShare,
        participants: finalParticipantsUids,
        isMessenger: isMessenger,
        isPersonal: isPersonal
    };

    document.getElementById('previewModal').classList.add('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';
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
        confirmSaveButton.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري الحفظ...'; 
    }
    
    const expenseRecord = {
        title: data.title,
        total_amount: data.amount,
        share: data.share,
        payer_id: currentUserID,
        participants_ids: data.participants,
        is_messenger: data.isMessenger,
        is_personal: data.isPersonal || false,
        timestamp: Date.now()
    };
    
    let payerContribution;
    if (data.isMessenger || data.isPersonal) {
        payerContribution = data.amount;
    } else {
        payerContribution = roundToTwo(data.amount - data.share);
    }
    
    const participantsToDebit = data.participants.filter(uid => uid !== currentUserID);
    const updates = {};
    const newExpenseRef = push(ref(db, 'expenses'));

    try {
        await runTransaction(ref(db, `users/${currentUserID}/balance`), (currentBalance) => {
            return roundToTwo((currentBalance || 0) + payerContribution);
        });

        for (const uid of participantsToDebit) {
            await runTransaction(ref(db, `users/${uid}/balance`), (currentBalance) => {
                return roundToTwo((currentBalance || 0) - data.share);
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

        window.hideModal();
        document.getElementById('successModal').classList.add('show');
        
        // إعادة تعيين الواجهة
        document.getElementById('expenseForm').reset();
        const personalBtn = document.getElementById('personalExpenseBtn');
        if(personalBtn.classList.contains('active-personal')) window.togglePersonalExpense();
        window.tempExpenseData = null;

    } catch (e) {
        console.error("Error saving expense:", e);
        alert("❌ فشلت العملية. يرجى التحقق من اتصالك.");
    } finally {
        if (confirmSaveButton) {
            confirmSaveButton.disabled = false;
            confirmSaveButton.textContent = 'حفظ'; 
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
        const isPersonal = expense.is_personal || false;
        const share = Number(expense.share);

        let displayAmount = 0;
        let mainTitle;
        const { date, time } = formatBankDate(expense.timestamp);

        if (isPayer && isMessenger && share < 0.1) return;

        if (isPayer && !isMessenger && !isPersonal) {
            displayAmount = share;
            mainTitle = `حصتك الخاصة في مصروف: ${expense.title}`;
            totalPersonalDebt += displayAmount;
        } else if (isPayer && isPersonal) {
            displayAmount = expense.total_amount;
            mainTitle = `مصروف شخصي: ${expense.title}`;
            totalPersonalDebt += displayAmount;
        } else if (expense.participants_ids.includes(currentUserID) && !isPayer) {
            displayAmount = share;
            const payerName = getUserNameById(expense.payer_id);
            mainTitle = `دين عليك لـ ${payerName} في مصروف: ${expense.title}`;
            totalPersonalDebt += displayAmount;
        } else {
            return;
        }

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
// 💰 منطق ملخص التسوية (Settlement Summary Logic)
// ============================================================
function calculateNetBalances() {
    if (!currentUserID || allUsers.length === 0) return;
    netBalances = {};
    allUsers.forEach(user => { if (user.uid !== currentUserID) netBalances[user.uid] = 0; });

    allExpenses.forEach(expense => {
        const share = Number(expense.share) || 0;
        if (expense.payer_id === currentUserID) {
            expense.participants_ids.forEach(uid => {
                if (uid !== currentUserID) netBalances[uid] = Math.round((netBalances[uid] + share) * 100) / 100;
            });
        } else if (expense.participants_ids.includes(currentUserID)) {
            const payerId = expense.payer_id;
            netBalances[payerId] = Math.round((netBalances[payerId] - share) * 100) / 100;
        }
    });

    allSettlements.forEach(settlement => {
        const amount = Number(settlement.amount) || 0;
        if (settlement.payer_id === currentUserID) netBalances[settlement.recipient_id] += amount;
        else if (settlement.recipient_id === currentUserID) netBalances[settlement.payer_id] -= amount;
    });
}

function updateSummaryDisplay() {
    const totalDebtEl = document.getElementById('totalDebt');
    const totalCreditEl = document.getElementById('totalCredit');
    const debtContainer = document.getElementById('debtContainer');
    const claimList = document.getElementById('claimList');
    const noDebtsEl = document.getElementById('noDebts');

    if (!totalDebtEl || !totalCreditEl || !debtContainer || !claimList) return;

    let totalDebt = 0, totalCredit = 0, hasDebtItems = false, hasClaimItems = false;
    debtContainer.innerHTML = ''; claimList.innerHTML = ''; 

    Object.keys(netBalances).forEach(otherUID => {
        const netAmount = netBalances[otherUID];
        const otherUserName = getUserNameById(otherUID);
        if (Math.abs(netAmount) < 0.1) return;

        if (netAmount < 0) {
            const amount = Math.abs(netAmount);
            totalDebt += amount; hasDebtItems = true;
            debtContainer.innerHTML += `
                <div class="balance-card">
                    <div class="balance-info">
                        <span class="balance-name">${otherUserName}</span>
                        <span class="balance-status text-red-600">يطلبك: ${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</span>
                    </div>
                    <button class="action-button" onclick="showSettleModal('${otherUserName}', ${amount}, '${otherUID}')">تسوية</button>
                </div>`;
        } else if (netAmount > 0) {
            const amount = netAmount;
            totalCredit += amount; hasClaimItems = true;
            claimList.innerHTML += `
                <div class="claim-item">
                    <span class="font-semibold text-gray-800">${otherUserName}: </span>
                    <div class="flex items-center space-x-2 space-x-reverse">
                        <span class="text-green-600 font-bold">${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</span>
                    </div>
                </div>`;
        }
    });

    totalDebtEl.innerHTML = `${totalDebt.toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;
    totalCreditEl.innerHTML = `${totalCredit.toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;
    if (noDebtsEl) { if (!hasDebtItems) noDebtsEl.classList.remove('hidden'); else noDebtsEl.classList.add('hidden'); }
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
        if (isPayer || isParticipant) combined.push({ type: 'expense', ...expense, timestamp: expense.timestamp });
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

    recordsToShow.forEach(record => {
        const { date, time } = formatBankDate(record.timestamp);
        if (record.type === 'expense') {
            const isPayer = record.payer_id === currentUserID;
            const isPersonal = record.is_personal || false;
            let iconClass = 'icon-danger', amountClass = 'amount-neg', amountText = '0.00', mainTitle = '', iconBadge = 'fa-arrow-down text-red-500';

            if (isPayer && !isPersonal) {
                const amountClaimed = (record.is_messenger || false) ? record.total_amount : roundToTwo(record.total_amount - (record.share || 0));
                if (amountClaimed > 0.1) {
                    amountText = `+ ${amountClaimed.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                    iconClass = 'icon-success'; amountClass = 'amount-pos'; iconBadge = 'fa-arrow-up text-green-500';
                    mainTitle = (record.is_messenger || false) ? `دفعة (مرسال): ${record.title}` : `دفعة لك عن: ${record.title}`;
                } else return;
            } else if (isPayer && isPersonal) {
                amountText = `- ${record.total_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                mainTitle = `مصروف شخصي: ${record.title}`;
            } else {
                amountText = `- ${Number(record.share).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                mainTitle = `دين لـ ${getUserNameById(record.payer_id)}: ${record.title}`;
            }

            container.innerHTML += `
                <div class="bankak-card">
                    <div class="card-main-content">
                        <div class="details-wrapper">
                            <div class="bank-icon-container ${iconClass} ml-3"><i class="fas fa-file-invoice-dollar"></i></div>
                            <div class="details-text text-right"><p class="transaction-title">${mainTitle}</p></div>
                        </div>
                        <div class="amount-display ${amountClass}">${amountText}</div>
                    </div>
                    <div class="card-footer-date"><span>${date}</span><span>${time}</span></div>
                </div>`;
        }
    });
    isLoadingHistory = false;
}

// ============================================================
// 🔔 منطق الإشعارات
// ============================================================

function loadNotifications() {
    if (!currentUserID || !db) return;
    onValue(ref(db, 'notifications'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            userNotifications = Object.keys(val).map(key => ({ id: key, ...val[key] })).filter(n => n.uid === currentUserID).sort((a, b) => b.timestamp - a.timestamp); 
            updateNotificationBadge();
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

// ============================================================
// 💾 دوال المودال
// ============================================================

window.hideModal = () => document.getElementById('previewModal').classList.remove('show');
window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');

// ============================================================
// 🔄 تحميل البيانات (Load Data)
// ============================================================

function refreshCurrentPageData() {
    if (document.getElementById('debtContainer')) { calculateNetBalances(); updateSummaryDisplay(); }
    if (document.getElementById('expensesContainer')) { currentPage = 1; filterHistory(activeFilter); displayHistory(); }
    if (document.getElementById('personalExpensesContainer')) { displayPersonalExpenses(); }
}

function loadData() {
    if (!currentUserID || !db) return;
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            updateHomeDisplay(); populateParticipants();
        }
    });
    onValue(ref(db, 'expenses'), (snapshot) => {
        allExpenses = snapshot.exists() ? Object.keys(snapshot.val()).map(key => ({ firebaseId: key, ...snapshot.val()[key] })) : [];
        refreshCurrentPageData();
    });
    onValue(ref(db, 'settlements'), (snapshot) => {
        allSettlements = snapshot.exists() ? Object.keys(snapshot.val()).map(key => ({ firebaseId: key, ...snapshot.val()[key] })) : [];
        refreshCurrentPageData();
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
        const logoutSidebarBtn = document.getElementById('logoutSidebarButton');
        if (logoutSidebarBtn) logoutSidebarBtn.onclick = () => auth.signOut().then(() => window.location.href = 'auth.html');
    } else {
        if (!window.location.href.includes('auth.html')) window.location.href = 'auth.html';
    }
});

// ============================================================
// 💰 منطق التسوية (Settle Logic)
// ============================================================

window.sendSettleTransaction = async function(recipientUID, amountInput, opNumber) {
    const amount = parseFloat(amountInput);
    if (!currentUserID || !recipientUID || isNaN(amount) || amount <= 0) return false;
    const updates = {};
    const newSettleRef = push(ref(db, 'settlements'));
    try {
        await runTransaction(ref(db, `users/${currentUserID}/balance`), (b) => roundToTwo((b || 0) + amount));
        await runTransaction(ref(db, `users/${recipientUID}/balance`), (b) => roundToTwo((b || 0) - amount));
        updates[`settlements/${newSettleRef.key}`] = { payer_id: currentUserID, recipient_id: recipientUID, amount, operation_number: opNumber, timestamp: Date.now() };
        await update(ref(db), updates);
        return true;
    } catch (e) { return false; }
};

window.showSettleModal = function(user, amount, uid) {
    currentSettleUser = user; currentSettleMaxAmount = amount; currentSettleRecipientUID = uid;
    document.getElementById('settleRelation').textContent = `تسوية الدين لـ ${user}`;
    document.getElementById('maxSettleAmountDisplay').textContent = amount.toLocaleString();
    const input = document.getElementById('settleAmount');
    input.value = amount;
    document.getElementById('settleModal').classList.add('show');
}

window.hideSettleModal = function() {
    document.getElementById('settleModal').classList.remove('show');
    document.getElementById('settleForm').reset();
}

document.addEventListener('DOMContentLoaded', () => {
    // إعداد مستمعات الأحداث
    const amountInput = document.getElementById('expenseAmount');
    if(amountInput) amountInput.addEventListener('input', (e) => window.formatAmountInput(e.target));

    const settleFormEl = document.getElementById('settleForm');
    if(settleFormEl) {
        settleFormEl.addEventListener('submit', async function(e) {
            e.preventDefault();
            const op = document.getElementById('operationNumber').value;
            const amt = parseFloat(document.getElementById('settleAmount').value.replace(/,/g, ''));
            if (op.length < 4 || isNaN(amt)) { alert("بيانات غير مكتملة"); return; }
            const res = await window.sendSettleTransaction(currentSettleRecipientUID, amt, op);
            if (res) { alert("✅ تم إرسال التسوية بنجاح!"); window.hideSettleModal(); }
        });
    }
});
