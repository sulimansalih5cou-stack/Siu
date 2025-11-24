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

// تنسيق الأرقام في الحقول
window.formatNumber = function(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US'); 
    }
};

// تنسيق التاريخ لستايل بنكك
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

    if (!balanceEl) return; 

    // 1. تحديث الاسم
    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;
    
    if (nameEl) nameEl.textContent = displayName;

    // 2. تحديث الرصيد واللون
    const balance = (currentUserDB && currentUserDB.balance) ? currentUserDB.balance : 0;
    balanceEl.textContent = balance.toLocaleString('en-US', {minimumFractionDigits: 1});

    if (balance < -0.1) {
        cardEl.classList.add('negative');
    } else {
        cardEl.classList.remove('negative');
    }
}

function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const div = document.createElement('div');
        div.className = 'participant-checkbox';
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

    const share = amount / participants.length;

    const text = `
        <ul class="list-disc pr-4 space-y-2 text-right" dir="rtl">
            <li><b>المصروف:</b> ${title}</li>
            <li><b>المبلغ:</b> ${amount.toLocaleString()} SDG</li>
            <li><b>عدد المشاركين:</b> ${participants.length}</li>
            <li><b>نصيب الفرد:</b> ${share.toLocaleString(undefined, {maximumFractionDigits: 1})} SDG</li>
        </ul>
    `;
    document.getElementById('previewText').innerHTML = text;
    
    // تحذير التكرار
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
        document.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
    } catch (e) {
        console.error(e);
        alert('خطأ في الاتصال');
    }
};

// إغلاق النوافذ
window.hideModal = () => {
    const modal = document.getElementById('previewModal');
    if(modal) modal.classList.remove('show');
};
window.hideSuccessModal = () => {
    const modal = document.getElementById('successModal');
    if(modal) modal.classList.remove('show');
};


// ============================================================
// 📜 منطق صفحة السجلات (History Logic)
// ============================================================

function displayHistory() {
    const container = document.getElementById('expensesContainer');
    if (!container || activeFilter === 'summary') return;
    
    container.innerHTML = ''; 

    // الفلاتر
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

    // رسم البطاقات
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
            mainTitle = `تحويل نقدي (أنت الدافع)`;
            detailsText = `المبلغ الكلي: ${expense.amount.toLocaleString('en-US')} SDG`;
        } else {
            netAmount = share;
            isPositive = false;
            const payerName = getUserNameById(expense.payer_id);
            mainTitle = `مشاركة (دفع: ${payerName})`;
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
                    ${sign} ${netAmount.toLocaleString('en-US', {minimumFractionDigits: 1})}
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
// 📊 منطق ملخص الأرصدة (Summary Logic)
// ============================================================

function calculateIndividualBalances() {
    const individualBalances = {};

    // 1. تهيئة الأرصدة بصفر لكل المستخدمين الآخرين
    allUsers.forEach(user => {
        if (user.uid !== currentUserID) {
            individualBalances[user.uid] = 0;
        }
    });

    // 2. تجميع كل المعاملات (المصروفات)
    allExpenses.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const share = expense.share;
        
        // نمر على جميع المشاركين في المصروف
        expense.participants_ids.forEach(participantID => {
            if (participantID === currentUserID) return; // تجاهل المستخدم الحالي

            // أنت الدافع (أنت دافع للمشارك حصته، لذلك هو مدين لك)
            if (isPayer && expense.participants_ids.includes(participantID)) {
                individualBalances[participantID] = roundToTwo(individualBalances[participantID] + share);
            } 
        });

        // حالة خاصة: الدافع ليس أنت، لكن أنت مشارك
        if (!isPayer && expense.participants_ids.includes(currentUserID)) {
             const payerID = expense.payer_id;
             // أنت مشارك، و الدافع هو payerID، لذلك أنت مدين للدافع بحصتك
             if (payerID !== currentUserID) {
                 individualBalances[payerID] = roundToTwo(individualBalances[payerID] - share);
             }
        }
    });
    
    return individualBalances;
}

function displaySummary() {
    const summaryContainer = document.getElementById('summaryContainer');
    if (!summaryContainer || activeFilter !== 'summary') return;

    summaryContainer.innerHTML = '';
    const balances = calculateIndividualBalances();
    let hasData = false;
    
    // عنوان الملخص
    summaryContainer.innerHTML += `
        <h3 class="text-lg font-bold text-gray-700 mb-4 border-b pb-2">ملخص الأرصدة مع زملائك</h3>
    `;

    // 3. عرض النتائج
    Object.keys(balances).forEach(uid => {
        const balance = balances[uid];
        const otherUserName = getUserNameById(uid);
        
        // لا تعرض صفر
        if (Math.abs(balance) < 0.01) return;
        
        hasData = true;
        
        let message = "";
        let cardClass = "";
        let iconClass = "";

        if (balance > 0) {
            // أنت تريد منه مالاً (هو مدين لك)
            message = `يدين لك ${otherUserName} بـ`;
            cardClass = "border-green-500 bg-green-50";
            iconClass = "fa-arrow-left text-green-600";
        } else {
            // أنت تدين له بمال
            message = `أنت مدين لـ ${otherUserName} بـ`;
            cardClass = "border-red-500 bg-red-50";
            iconClass = "fa-arrow-right text-red-600";
        }

        const formattedBalance = Math.abs(balance).toLocaleString('en-US', {minimumFractionDigits: 1});

        summaryContainer.innerHTML += `
            <div class="p-4 border-r-4 ${cardClass} rounded-lg mb-3 flex justify-between items-center shadow-sm">
                <div class="flex items-center">
                    <i class="fas ${iconClass} ml-3 text-lg"></i>
                    <p class="text-gray-700 font-semibold">
                        ${message} <span class="text-xl font-extrabold dir-ltr">${formattedBalance} SDG</span>
                    </p>
                </div>
                <span class="text-sm text-gray-500">${otherUserName}</span>
            </div>
        `;
    });

    if (!hasData) {
        summaryContainer.innerHTML += '<p class="text-center text-gray-500 mt-10">لا يوجد لديك أي أرصدة فردية حالياً (الجميع متساوي!)</p>';
    }
}

window.setFilter = function(filterType, element) {
    activeFilter = filterType;
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
    
    const summaryContainer = document.getElementById('summaryContainer');
    const expensesContainer = document.getElementById('expensesContainer');

    if (filterType === 'summary') {
        expensesContainer.classList.add('hidden');
        summaryContainer.classList.remove('hidden');
        displaySummary();
    } else {
        summaryContainer.classList.add('hidden');
        expensesContainer.classList.remove('hidden');
        displayHistory();
    }
}


// ============================================================
// 🔐 المصادقة والبداية (Entry Point)
// ============================================================

function initializePage() {
    // تشغيل تحديثات الشاشة المناسبة فور تحميل البيانات
    if (document.getElementById('expenseForm')) {
        updateHomeDisplay();
        populateParticipants();
    } else if (document.getElementById('expensesContainer')) {
        displayHistory();
        // displaySummary سيتم تشغيلها فقط عند الضغط على الفلتر
    }
}

function loadData() {
    if (!currentUserID) return;

    // جلب المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            
            initializePage(); // تحديث الشاشة بعد جلب المستخدمين
        }
    });

    // جلب المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);
            
            initializePage(); // تحديث الشاشة بعد جلب المصروفات
        } else {
            allExpenses = [];
            initializePage(); 
        }
    });
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        
        // تحديث الهيدر في الصفحتين
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
