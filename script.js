// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, set, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app); 
const auth = getAuth(app); 

// متغيرات عامة
let allUsers = []; 
let currentUserID = null; 
let currentUserDB = null; 
let allExpenses = [];
let activeFilter = '30days'; 

// ============================================================
// 🛠️ دوال مساعدة عامة
// ============================================================

function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم';
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
    const month = dateObj.toLocaleString('en-US', { month: 'short' }); 
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
    
    if (!balanceEl && !nameEl) return; 

    // 1. تحديث الاسم
    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;

    if (nameEl) nameEl.textContent = displayName;

    // 2. تحديث الرصيد واللون
    const balance = (currentUserDB && currentUserDB.balance) ? currentUserDB.balance : 0;
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
// 💰 منطق ملخص التسوية (Settlement Summary Logic) - الجديد!
// ============================================================

function calculateSettlementSummary() {
    const container = document.getElementById('summaryContainer');
    if (!container || !currentUserID || allUsers.length === 0) return;

    let netBalances = {}; 

    allUsers.forEach(user => {
        if (user.uid !== currentUserID) {
            netBalances[user.uid] = 0;
        }
    });

    allExpenses.forEach(expense => {
        const payerId = expense.payer_id;
        const share = expense.share; 
        const participants = expense.participants_ids;

        // 1. إذا كان المستخدم الحالي هو الدافع
        if (payerId === currentUserID) {
            participants.forEach(participantId => {
                if (participantId !== currentUserID) {
                    // المستخدم الآخر مدين لك
                    netBalances[participantId] = roundToTwo(netBalances[participantId] + share);
                }
            });
        } 
        // 2. إذا كان المستخدم الحالي مشاركاً وليس الدافع
        else if (participants.includes(currentUserID) && payerId !== currentUserID) {
            // أنت مدين للدافع
            netBalances[payerId] = roundToTwo(netBalances[payerId] - share);
        }
    });

    container.innerHTML = '';
    let hasDebts = false;

    Object.keys(netBalances).forEach(otherUID => {
        const netAmount = netBalances[otherUID];
        const otherUserName = getUserNameById(otherUID);

        if (Math.abs(netAmount) < 0.1) return; 

        hasDebts = true;
        let summaryText;
        let colorClass;

        if (netAmount > 0) {
            // أنت داير من فلان (إيجابي لك)
            summaryText = `أنت داير من **${otherUserName}** مبلغ:`;
            colorClass = "text-green-600 border-green-200 bg-green-50";
        } else {
            // فلان داير منك (سلبي لك)
            summaryText = `**${otherUserName}** داير منك مبلغ:`;
            colorClass = "text-red-600 border-red-200 bg-red-50";
        }
        
        const amountDisplay = Math.abs(netAmount).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 2});

        const itemHTML = `
            <div class="flex justify-between items-center p-3 rounded-lg border-r-4 shadow-sm ${colorClass} mb-2">
                <p class="font-medium">
                    ${summaryText}
                </p>
                <span class="font-bold text-lg dir-ltr">${amountDisplay} SDG</span>
            </div>
        `;
        container.innerHTML += itemHTML;
    });

    if (!hasDebts) {
        container.innerHTML = `
            <p class="text-center text-gray-500 font-medium py-2">
                <i class="fas fa-check-circle text-blue-500 ml-1"></i> لا توجد تسويات مالية معلقة حالياً!
            </p>
        `;
    }
}


// ============================================================
// 📜 منطق صفحة السجلات (History Logic - Bankak Style)
// ============================================================

window.setFilter = function(filterType, element) {
    activeFilter = filterType;
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
    displayHistory();
}

function updateHistoryHeader() {
    const headerName = document.getElementById('displayHeaderName');
    const headerEmail = document.getElementById('displayHeaderEmail');

    if (headerName && auth.currentUser) headerName.textContent = auth.currentUser.displayName || 'مستخدم';
    if (headerEmail && auth.currentUser) headerEmail.textContent = auth.currentUser.email || '';
}

function displayHistory() {
    const container = document.getElementById('expensesContainer');
    if (!container) return; 

    container.innerHTML = ''; 

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    let filteredList = allExpenses.filter(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);
        if (!isPayer && !isParticipant) return false;

        if (activeFilter === '30days') return (now - expense.timestamp) <= (30 * oneDay);
        if (activeFilter === '3months') return (now - expense.timestamp) <= (90 * oneDay);
        if (activeFilter === 'incoming') return isPayer;
        if (activeFilter === 'outgoing') return !isPayer;
        return true; 
    });

    if (filteredList.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 mt-10">لا توجد سجلات مطابقة.</p>';
        return;
    }

    filteredList.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const share = expense.share;
        let netAmount = 0;
        let isPositive = false;
        let mainTitle = "";
        let detailsText = "";

        if (isPayer) {
            netAmount = expense.amount - share; 
            isPositive = true;
            const otherParticipantsCount = expense.participants_ids.length - 1;
            mainTitle = `استرداد من ${otherParticipantsCount} مشارك`;
            detailsText = `دفعت: ${expense.amount.toLocaleString(undefined, {maximumFractionDigits: 1})} | حصتك: ${share.toLocaleString(undefined, {maximumFractionDigits: 1})} SDG`;
        } else {
            netAmount = share;
            isPositive = false;
            const payerName = getUserNameById(expense.payer_id);
            mainTitle = `مشاركة مع ${payerName}`;
            detailsText = `حصتك المطلوبة`;
        }

        const colorClass = isPositive ? "amount-pos" : "amount-neg";
        const sign = isPositive ? "+" : "-";
        const iconClass = isPositive ? "icon-success" : "icon-danger";
        const arrowIcon = isPositive ? "fa-arrow-down" : "fa-arrow-up";
        const { date, time } = formatBankDate(expense.timestamp);

        const cardHTML = `
        <div class="bankak-card">
            <div class="card-main-content">
                <div class="amount-display ${colorClass}">
                    ${sign} ${netAmount.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2})}
                </div>
                <div class="details-wrapper">
                    <div class="bank-icon-container ${iconClass} ml-3">
                        <span class="font-bold text-xs">ج.س</span>
                        <div class="arrow-badge ${isPositive ? 'text-green-600' : 'text-red-600'}">
                            <i class="fas ${arrowIcon}"></i>
                        </div>
                    </div>
                    <div class="details-text text-right">
                        <p class="transaction-title">${expense.title}</p>
                        <p class="transaction-sub">
                            ${mainTitle}<br>
                            <span class="text-xs opacity-80">${detailsText}</span>
                        </p>
                    </div>
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
}

// ============================================================
// 💾 منطق الحفظ (Save Expense)
// ============================================================

window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value;
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);

    if (!title || isNaN(amount) || amount <= 0) {
        alert('الرجاء إدخال البيانات بشكل صحيح');
        return;
    }

    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    const participants = Array.from(checkboxes).map(cb => cb.getAttribute('data-uid'));
    if (!participants.includes(currentUserID)) participants.push(currentUserID);

    const share = roundToTwo(amount / participants.length);

    const text = `
        <ul class="list-disc pr-4 space-y-2 text-right" dir="rtl">
            <li><b>المصروف:</b> ${title}</li>
            <li><b>المبلغ:</b> ${amount.toLocaleString()} SDG</li>
            <li><b>عدد المشاركين:</b> ${participants.length}</li>
            <li><b>نصيب الفرد:</b> ${share.toLocaleString(undefined, {maximumFractionDigits: 2})} SDG</li>
        </ul>
    `;
    document.getElementById('previewText').innerHTML = text;

    const today = new Date().toISOString().split('T')[0];
    const isDuplicate = allExpenses.some(e => e.date === today && e.title === title && e.amount === amount);
    const warningEl = document.getElementById('warning');
    if(warningEl) warningEl.style.display = isDuplicate ? 'block' : 'none';

    document.getElementById('previewModal').classList.add('show');
};

window.saveExpense = async function() {
    window.hideModal();
    const title = document.getElementById('expenseTitle').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value.replace(/,/g, ''));
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    let participantsIDs = Array.from(checkboxes).map(cb => cb.getAttribute('data-uid'));
    if (!participantsIDs.includes(currentUserID)) participantsIDs.push(currentUserID);

    const share = roundToTwo(amount / participantsIDs.length);
    const updates = {};

    allUsers.forEach(user => {
        let bal = user.balance || 0;
        if (user.uid === currentUserID) bal += (amount - share);
        else if (participantsIDs.includes(user.uid)) bal -= share;
        updates[`users/${user.uid}/balance`] = roundToTwo(bal);
    });

    const newKey = push(ref(db, 'expenses')).key;
    updates[`expenses/${newKey}`] = {
        title, amount, share,
        payer_id: currentUserID,
        participants_ids: participantsIDs,
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0]
    };

    try {
        await update(ref(db), updates);
        document.getElementById('successModal').classList.add('show');
        document.getElementById('expenseForm').reset();
        document.querySelectorAll('#participantsCheckboxes input[type=checkbox]').forEach(c => c.checked = false); 
    } catch (e) {
        console.error("Error saving expense:", e);
        alert('خطأ في الاتصال بقاعدة البيانات.');
    }
};

// ============================================================
// 🔄 تحميل البيانات (Load Data)
// ============================================================

function loadData() {
    if (!currentUserID) return;

    // جلب المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);

            updateHomeDisplay();
            updateHistoryHeader();
            populateParticipants();
        }
    });

    // جلب المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);

            calculateSettlementSummary();
            displayHistory();
        } else {
            allExpenses = [];
            calculateSettlementSummary();
            displayHistory();
        }
    });
}

// ============================================================
// 🔐 المصادقة والبداية (Entry Point)
// ============================================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;

        const headerName = document.getElementById('displayHeaderName');
        const headerEmail = document.getElementById('displayHeaderEmail');
        
        if (headerName) headerName.textContent = user.displayName || 'مستخدم';
        if (headerEmail) headerEmail.textContent = user.email || '';
        
        loadData();

        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) logoutBtn.onclick = () => auth.signOut().then(() => window.location.href = 'auth.html');

    } else {
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});

// إغلاق النوافذ
window.hideModal = () => document.getElementById('previewModal').classList.remove('show');
window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');
