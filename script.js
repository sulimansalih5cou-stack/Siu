// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase - (بياناتك الحقيقية هنا)
const firebaseConfig = {
  apiKey: "AIzaSyA2GNsXj4DzWyCYLKuVT3i1XBKfjX3ccuM",
  authDomain: "siu-students.firebaseapp.com",
  databaseURL: "https://siu-students-default-rtdb.firebaseio.com",
  projectId: "siu-students",
  messagingSenderId: "76007314543",
  appId: "1:76007314543:web:4850b668cec4b93bdc699a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app); 
const auth = getAuth(app); 

// متغيرات عامة
let allUsers = []; 
let currentUserID = null; 
let currentUserDB = null; 
let allExpenses = [];
let allNotifications = [];
let activeFilter = '30days'; 

// متغيرات التسوية
let settleTargetUID = null;
let settleTargetName = null;
let settleActionType = null;
let settleMaxAmount = 0;

// --- دوال مساعدة ---
function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم';
}
function roundToTwo(num) { return Math.round(num * 100) / 100; }
window.formatNumber = function(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') input.value = parseFloat(value).toLocaleString('en-US'); 
};
function formatBankDate(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const dateObj = new Date(timestamp);
    return { 
        date: dateObj.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }), 
        time: dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }) 
    };
}

// ============================================================
// 🎨 دوال العرض المشتركة (تحديث الهيدر والإشعارات)
// ============================================================

function updateCommonUI() {
    // تحديث بطاقة الرصيد (موجودة في كل الصفحات)
    const balanceEl = document.getElementById('currentBalance');
    const nameEl = document.getElementById('userNamePlaceholder');
    const cardEl = document.getElementById('currentBalanceCard');

    if (balanceEl && nameEl && cardEl) {
        let displayName = currentUserDB ? currentUserDB.displayName : (auth.currentUser ? auth.currentUser.displayName : "مستخدم");
        nameEl.textContent = displayName;

        const balance = currentUserDB ? currentUserDB.balance : 0;
        balanceEl.textContent = balance.toLocaleString('en-US', {minimumFractionDigits: 1});

        if (balance < -0.1) cardEl.classList.add('negative');
        else cardEl.classList.remove('negative');
    }

    // تحديث شارة الإشعارات (موجودة في كل الصفحات)
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        const unreadCount = allNotifications.filter(n => n.recipientId === currentUserID && !n.read).length;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
}

// ============================================================
// 🏠 دوال الصفحة الرئيسية (index.html)
// ============================================================

function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';
    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        container.innerHTML += `
            <label class="checkbox-item">
                <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-4 w-4 text-blue-600 rounded">
                <span class="mr-2 text-sm">${user.displayName}</span>
            </label>`;
    });
}
window.selectAllParticipants = function() {
    const checks = document.querySelectorAll('#participantsCheckboxes input');
    if(checks) checks.forEach(cb => cb.checked = true);
};

window.previewExpense = function() {
    const titleEl = document.getElementById('expenseTitle');
    const amountEl = document.getElementById('expenseAmount');
    if (!titleEl || !amountEl) return;

    const title = titleEl.value;
    const amount = parseFloat(amountEl.value.replace(/,/g, ''));
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    
    if (!title || !amount) { alert('البيانات ناقصة'); return; }
    if (checkboxes.length === 0) { alert('اختر مشاركاً واحداً على الأقل'); return; }

    const participants = Array.from(checkboxes).map(cb => cb.dataset.uid);
    participants.push(currentUserID);
    const share = roundToTwo(amount / participants.length);

    document.getElementById('previewText').innerHTML = `
        <p><strong>المصروف:</strong> ${title}</p>
        <p><strong>المبلغ:</strong> ${amount.toLocaleString()} SDG</p>
        <p><strong>عدد المشاركين:</strong> ${participants.length}</p>
        <p><strong>نصيب الفرد:</strong> <span class="text-red-600 font-bold dir-ltr">${share.toLocaleString()} SDG</span></p>
    `;
    document.getElementById('previewModal').classList.add('show');
    
    window.pendingExpense = { title, amount, participants, share };
};

window.saveExpense = async function() {
    window.hideModal();
    if (!window.pendingExpense) return;
    const { title, amount, participants, share } = window.pendingExpense;
    
    const updates = {};
    const newKey = push(ref(db, 'expenses')).key;
    const payerName = currentUserDB ? currentUserDB.displayName : 'مستخدم';

    updates[`expenses/${newKey}`] = {
        title, amount, share, payer_id: currentUserID, participants_ids: participants, timestamp: Date.now()
    };

    participants.forEach(uid => {
        const userObj = allUsers.find(u => u.uid === uid);
        let bal = userObj ? userObj.balance : 0;
        
        if (uid === currentUserID) bal += (amount - share);
        else {
            bal -= share;
            const notifKey = push(ref(db, 'notifications')).key;
            updates[`notifications/${notifKey}`] = {
                recipientId: uid,
                message: `${payerName} اشترى "${title}". حصتك: ${share} SDG`,
                timestamp: Date.now(), read: false
            };
        }
        updates[`users/${uid}/balance`] = roundToTwo(bal);
    });

    await update(ref(db), updates);
    document.getElementById('successModal').classList.add('show');
    document.getElementById('expenseForm').reset();
    populateParticipants();
};

// ============================================================
// 📋 دوال صفحة مصروفاتي (my_expenses.html)
// ============================================================

function displayMyExpensesSummary() {
    const totalEl = document.getElementById('totalMyExpenses');
    const listEl = document.getElementById('myExpenseHistory');
    if (!totalEl) return;

    let total = 0;
    let html = '';
    const myExps = allExpenses.filter(e => e.participants_ids.includes(currentUserID)).sort((a, b) => b.timestamp - a.timestamp);

    myExps.forEach(e => {
        total += e.share;
        const { date, time } = formatBankDate(e.timestamp);
        html += `
            <div class="expense-item-card">
                <div class="text-right">
                    <p class="font-bold text-gray-800">${e.title}</p>
                    <span class="text-xs text-gray-500">${date} - ${time}</span>
                    <span class="block text-xs text-gray-400">${e.payer_id === currentUserID ? 'أنت الدافع' : 'دفعه ' + getUserNameById(e.payer_id)}</span>
                </div>
                <div class="text-left"><strong class="dir-ltr text-red-600">- ${e.share.toLocaleString()} SDG</strong></div>
            </div>`;
    });

    totalEl.textContent = roundToTwo(total).toLocaleString();
    listEl.innerHTML = html || '<p class="text-center text-gray-400">لا توجد بيانات.</p>';
}

// ============================================================
// 📜 دوال صفحة السجلات (history.html)
// ============================================================

window.setFilter = function(type, el) {
    activeFilter = type;
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    
    const expCont = document.getElementById('expensesContainer');
    const sumCont = document.getElementById('summaryContainer');
    if(!expCont || !sumCont) return;

    if (type === 'summary') {
        expCont.classList.add('hidden');
        sumCont.classList.remove('hidden');
        displaySummary();
    } else {
        sumCont.classList.add('hidden');
        expCont.classList.remove('hidden');
        displayHistory();
    }
};

function displayHistory() {
    const container = document.getElementById('expensesContainer');
    if (!container || activeFilter === 'summary') return;
    
    container.innerHTML = '';
    const now = Date.now();
    const filtered = allExpenses.filter(e => {
        const relevant = e.payer_id === currentUserID || e.participants_ids.includes(currentUserID);
        if (!relevant) return false;
        if (activeFilter === '30days') return (now - e.timestamp) < 2592000000;
        if (activeFilter === 'incoming') return e.payer_id === currentUserID;
        if (activeFilter === 'outgoing') return e.payer_id !== currentUserID;
        return true;
    });

    let html = '';
    filtered.forEach(e => {
        const isPayer = e.payer_id === currentUserID;
        const net = isPayer ? (e.amount - e.share) : e.share;
        const color = isPayer ? 'amount-pos' : 'amount-neg';
        const sign = isPayer ? '+' : '-';
        const { date, time } = formatBankDate(e.timestamp);
        
        html += `
        <div class="bankak-card">
            <div class="card-main-content">
                <div class="amount-display ${color}">${sign} ${net.toLocaleString()}</div>
                <div class="details-wrapper">
                    <div class="bank-icon-container ${isPayer ? 'icon-success' : 'icon-danger'} ml-3"><span class="font-bold text-xs">ج.س</span></div>
                    <div class="details-text text-right">
                        <p class="transaction-title">${e.title}</p>
                        <p class="transaction-sub">${isPayer ? 'تحويل نقدي (أنت الدافع)' : 'مشاركة (دفع: '+getUserNameById(e.payer_id)+')'}</p>
                    </div>
                </div>
            </div>
            <div class="card-footer-date"><span>${date}</span><span>${time}</span></div>
        </div>`;
    });
    container.innerHTML = html || '<p class="text-center text-gray-400 mt-10">لا توجد سجلات.</p>';
}

function displaySummary() {
    const container = document.getElementById('summaryContainer');
    if(!container) return;
    let balances = {};
    allUsers.forEach(u => { if(u.uid !== currentUserID) balances[u.uid] = 0; });
    
    allExpenses.forEach(e => {
        const isPayer = e.payer_id === currentUserID;
        e.participants_ids.forEach(pId => {
            if (pId === currentUserID) return;
            if (isPayer) balances[pId] += e.share;
        });
        if (!isPayer && e.participants_ids.includes(currentUserID)) {
            if (e.payer_id !== currentUserID) balances[e.payer_id] -= e.share;
        }
    });

    let html = '<h3 class="font-bold mb-4 border-b pb-2">ملخص الأرصدة</h3>';
    Object.keys(balances).forEach(uid => {
        const bal = roundToTwo(balances[uid]);
        if (Math.abs(bal) < 1) return;
        
        const isPos = bal > 0;
        html += `
        <div class="p-4 border-r-4 ${isPos ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'} rounded-lg mb-3 shadow-sm">
            <div class="flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-700">${isPos ? `${getUserNameById(uid)} داير منك` : `أنت داير لـ ${getUserNameById(uid)}`}</p>
                    <span class="text-xl font-extrabold dir-ltr">${Math.abs(bal).toLocaleString()} SDG</span>
                </div>
                <button onclick="openSettleModal('${uid}', '${getUserNameById(uid)}', '${isPos ? 'receive' : 'pay'}', ${Math.abs(bal)})" 
                        class="btn text-xs px-3 py-1 w-auto ${isPos ? 'bg-green-600' : 'bg-red-600'}">تسوية</button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

// --- التسوية ---
window.openSettleModal = function(uid, name, type, amount) {
    settleTargetUID = uid; settleTargetName = name; settleActionType = type; settleMaxAmount = amount;
    const summary = document.getElementById('settleSummary');
    const btn = document.getElementById('confirmSettleButton');
    
    summary.innerHTML = `<p>تسوية مع: <strong>${name}</strong></p><p>المبلغ المطلوب: <span class="dir-ltr font-bold">${amount.toLocaleString()} SDG</span></p><p class="text-sm text-${type==='pay'?'red':'green'}-600">${type==='pay'?'أنت ستدفع':'أنت ستستلم'}</p>`;
    document.getElementById('settleAmountInput').value = amount.toLocaleString();
    document.getElementById('settleReference').value = '';
    btn.textContent = 'تأكيد'; btn.disabled = false;
    document.getElementById('settleModal').classList.add('show');
};

window.confirmSettleUp = async function() {
    const amount = parseFloat(document.getElementById('settleAmountInput').value.replace(/,/g, ''));
    const refNum = document.getElementById('settleReference').value;
    
    if (!amount || !refNum || refNum.length < 4) { alert('بيانات غير صحيحة'); return; }
    
    document.getElementById('confirmSettleButton').disabled = true;
    window.hideSettleModal();

    const updates = {};
    const myChange = settleActionType === 'pay' ? amount : -amount;
    const otherChange = settleActionType === 'pay' ? -amount : amount;

    const me = allUsers.find(u => u.uid === currentUserID);
    const other = allUsers.find(u => u.uid === settleTargetUID);
    updates[`users/${currentUserID}/balance`] = roundToTwo(me.balance + myChange);
    updates[`users/${settleTargetUID}/balance`] = roundToTwo(other.balance + otherChange);

    const key = push(ref(db, 'settlements')).key;
    updates[`settlements/${key}`] = {
        amount, payer: settleActionType==='pay'?currentUserID:settleTargetUID, 
        receiver: settleActionType==='pay'?settleTargetUID:currentUserID,
        timestamp: Date.now(), reference: refNum
    };

    await update(ref(db), updates);
    document.getElementById('successModal').classList.add('show');
    loadData();
};

// --- الإشعارات ---
window.openNotificationModal = function() {
    const list = document.getElementById('notificationsList');
    if(!list) return;
    
    const myNotifs = allNotifications.filter(n => n.recipientId === currentUserID).sort((a,b) => b.timestamp - a.timestamp);
    
    let html = '';
    if(myNotifs.length === 0) html = '<p class="text-center text-gray-400">لا توجد إشعارات.</p>';
    myNotifs.forEach(n => {
        const { date } = formatBankDate(n.timestamp);
        html += `<div class="p-3 rounded border ${n.read ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'}"><p class="text-sm">${n.message}</p><span class="text-xs text-gray-400">${date}</span></div>`;
    });
    list.innerHTML = html;
    document.getElementById('notificationModal').classList.add('show');
};

window.markAllAsRead = async function() {
    const updates = {};
    allNotifications.filter(n => n.recipientId === currentUserID && !n.read).forEach(n => {
        updates[`notifications/${n.firebaseId}/read`] = true;
    });
    await update(ref(db), updates);
};

window.hideNotificationModal = () => document.getElementById('notificationModal').classList.remove('show');
window.hideModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
window.hideSuccessModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));

// --- التحميل والمصادقة ---
function initializePage() {
    updateCommonUI(); // تحديث العناصر المشتركة (هيدر، إشعارات)
    
    // تحديث العناصر الخاصة بكل صفحة
    if (document.getElementById('expenseForm')) populateParticipants();
    if (document.getElementById('expensesContainer')) displayHistory();
    if (document.getElementById('myExpenseHistory')) displayMyExpensesSummary();
}

function loadData() {
    if(!currentUserID) return;
    const endpoints = ['users', 'expenses', 'notifications'];
    
    endpoints.forEach(ep => {
        onValue(ref(db, ep), snap => {
            const val = snap.val();
            if (ep === 'users') {
                allUsers = val ? Object.keys(val).map(k => ({uid: k, ...val[k]})) : [];
                currentUserDB = allUsers.find(u => u.uid === currentUserID);
                initializePage();
            } else if (ep === 'expenses') {
                allExpenses = val ? Object.keys(val).map(k => ({firebaseId: k, ...val[k]})) : [];
                initializePage();
            } else if (ep === 'notifications') {
                allNotifications = val ? Object.keys(val).map(k => ({firebaseId: k, ...val[k]})) : [];
                initializePage();
            }
        });
    });
}

onAuthStateChanged(auth, user => {
    const isAuthPage = window.location.pathname.includes('auth.html');
    if (user) {
        currentUserID = user.uid;
        if (isAuthPage) {
            window.location.href = 'index.html';
        } else {
            loadData();
        }
        
        const logoutBtn = document.getElementById('logoutButton');
        if(logoutBtn) logoutBtn.onclick = () => auth.signOut().then(() => window.location.href = 'auth.html');
    } else {
        if (!isAuthPage) window.location.href = 'auth.html';
    }
});