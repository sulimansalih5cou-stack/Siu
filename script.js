// 🔥 الاستيرادات الصحيحة عبر CDN لـ Firebase V9
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase الخاصة بك
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

// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// المتغيرات العامة
let allUsers = [];
let currentUserID = null;
let currentUserDB = null;
let allExpenses = [];
let allNotifications = [];
let pendingExpense = null;
let activeFilter = '30days'; // لصفحة history

// متغيرات التسوية
let settleTargetUID = null;
let settleTargetName = null;
let settleActionType = null;
let settleMaxAmount = 0;

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

function formatBankDate(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const dateObj = new Date(timestamp);
    return {
        date: dateObj.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
        time: dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
}

// تنسيق الأرقام في الحقول
window.formatNumber = function(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') input.value = parseFloat(value).toLocaleString('en-US');
};

// إغلاق النوافذ المنبثقة
window.hideModal = () => document.getElementById('previewModal')?.classList.remove('show');
window.hideSuccessModal = () => document.getElementById('successModal')?.classList.remove('show');
window.hideNotificationModal = () => document.getElementById('notificationModal')?.classList.remove('show');
window.hideSettleModal = () => document.getElementById('settleModal')?.classList.remove('show');


// ============================================================
// 🎨 تحديث الواجهة العامة
// ============================================================

function updateCommonUI() {
    // تحديث بطاقة الرصيد
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

    // تحديث شارة الإشعارات
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        const unreadCount = allNotifications.filter(n => n.recipientId === currentUserID && !n.read).length;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
}

// ============================================================
// 🏠 منطق صفحة إضافة مصروف (index.html)
// ============================================================

function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const div = document.createElement('label');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-4 w-4 text-blue-600 rounded">
            <span class="mr-2 text-sm">${user.displayName}</span>
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
        alert('الرجاء إدخال اسم ومبلغ المصروف بشكل صحيح.');
        return;
    }

    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    const participants = Array.from(checkboxes).map(cb => cb.getAttribute('data-uid'));
    const totalParticipantsList = [...participants, currentUserID];
    const share = roundToTwo(amount / totalParticipantsList.length);

    const text = `
        <ul class="list-disc pr-4 space-y-2 text-right" dir="rtl">
            <li><b>المصروف:</b> ${title}</li>
            <li><b>المبلغ:</b> ${amount.toLocaleString()} SDG</li>
            <li><b>عدد المشاركين:</b> ${totalParticipantsList.length}</li>
            <li><b>نصيب الفرد:</b> ${share.toLocaleString(undefined, {maximumFractionDigits: 1})} SDG</li>
        </ul>
    `;
    document.getElementById('previewText').innerHTML = text;

    pendingExpense = { title, amount, participants, share };

    const today = new Date().toISOString().split('T')[0];
    const isDuplicate = allExpenses.some(e => e.date === today && e.title === title && e.amount === amount);
    const warningEl = document.getElementById('warning');
    if(warningEl) warningEl.style.display = isDuplicate ? 'block' : 'none';

    document.getElementById('previewModal').classList.add('show');
};

window.saveExpense = async function() {
    window.hideModal();
    if (!pendingExpense) return;
    const { title, amount, participants, share } = pendingExpense;

    const updates = {};
    const newKey = push(ref(db, 'expenses')).key;
    const payerName = currentUserDB ? currentUserDB.displayName : 'أنت';

    updates[`expenses/${newKey}`] = {
        title, amount, share,
        payer_id: currentUserID,
        participants_ids: [...participants, currentUserID],
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0]
    };

    allUsers.forEach(user => {
        let bal = user.balance || 0;

        if (user.uid === currentUserID) {
            bal += (amount - share);
        }
        else if (participants.includes(user.uid)) {
            bal -= share;

            const notifKey = push(ref(db, 'notifications')).key;
            updates[`notifications/${notifKey}`] = {
                recipientId: user.uid,
                message: `${payerName} اشترى "${title}". حصتك: ${share} SDG`,
                timestamp: Date.now(), read: false
            };
        }

        updates[`users/${user.uid}/balance`] = roundToTwo(bal);
    });

    try {
        await update(ref(db), updates);
        document.getElementById('successModal')?.classList.add('show');
        document.getElementById('expenseForm')?.reset();
        document.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
        pendingExpense = null;
    } catch (e) {
        console.error("Firebase Update Error:", e);
        alert('فشل تسجيل المصروف. يرجى التحقق من قواعد الأمان في Firebase.');
    }
};

// ============================================================
// 📜 منطق صفحة السجلات (history.html)
// ============================================================

window.setFilter = function(filterType, element) {
    activeFilter = filterType;
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    if (element) element.classList.add('active'); // للعناصر الموجودة فقط

    const expCont = document.getElementById('expensesContainer');
    const sumCont = document.getElementById('summaryContainer');

    if (sumCont && expCont) {
        if (filterType === 'summary') {
            expCont.classList.add('hidden');
            sumCont.classList.remove('hidden');
            displaySummary();
        } else {
            sumCont.classList.add('hidden');
            expCont.classList.remove('hidden');
            displayHistory();
        }
    } else {
        displayHistory(); 
    }
}

function displayHistory() {
    const container = document.getElementById('expensesContainer');
    if (!container) return; 

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

    container.innerHTML = filteredList.map(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const share = expense.share;
        // المبلغ الصافي (ما دخل/خرج من رصيدك)
        let netAmount = isPayer ? expense.amount - share : share;
        let isPositive = isPayer;
        let mainTitle = isPayer ? `تحويل نقدي (أنت الدافع)` : `مشاركة (دفع: ${getUserNameById(expense.payer_id)})`;
        let detailsText = isPayer ? `المبلغ الكلي: ${expense.amount.toLocaleString('en-US')} SDG` : `حصتك المطلوبة`;

        const colorClass = isPositive ? "amount-pos" : "amount-neg";
        const sign = isPositive ? "+" : "-";
        const iconClass = isPositive ? "icon-success" : "icon-danger";
        const arrowIcon = isPositive ? "fa-arrow-down" : "fa-arrow-up";
        const { date, time } = formatBankDate(expense.timestamp);

        return `
        <div class="bankak-card">
            <div class="card-main-content">
                <div class="amount-display ${colorClass}">
                    ${sign} ${roundToTwo(netAmount).toLocaleString('en-US', {minimumFractionDigits: 1})}
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
    }).join('');
}

// 📊 منطق الملخص والتسوية (Summary & Settlement)
function displaySummary() {
    const container = document.getElementById('summaryContainer');
    if(!container) return;
    let balances = {};
    allUsers.forEach(u => { if(u.uid !== currentUserID) balances[u.uid] = 0; });
    
    // حساب صافي الدين الثنائي من المصروفات
    allExpenses.forEach(e => {
        const isPayer = e.payer_id === currentUserID;
        if (isPayer) {
            e.participants_ids.forEach(pId => {
                if (pId !== currentUserID) balances[pId] += e.share; // الشخص الآخر مدين لك (رصيدك منه يزيد)
            });
        } else if (e.participants_ids.includes(currentUserID)) {
            if (e.payer_id !== currentUserID) balances[e.payer_id] -= e.share; // أنت مدين للدافع (رصيدك منه يقل)
        }
    });

    let html = '<h3 class="font-bold mb-4 border-b pb-2">ملخص الأرصدة</h3>';
    let summaryFound = false;

    Object.keys(balances).forEach(uid => {
        const bal = roundToTwo(balances[uid]);
        if (Math.abs(bal) < 1) return;
        
        summaryFound = true;
        const isPos = bal > 0;
        const absBal = Math.abs(bal);
        
        html += `
        <div class="p-4 border-r-4 ${isPos ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'} rounded-lg mb-3 shadow-sm">
            <div class="flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-700">${isPos ? `${getUserNameById(uid)} داير منك` : `أنت داير لـ ${getUserNameById(uid)}`}</p>
                    <span class="text-xl font-extrabold dir-ltr">${absBal.toLocaleString()} SDG</span>
                </div>
                <button onclick="openSettleModal('${uid}', '${getUserNameById(uid)}', '${isPos ? 'receive' : 'pay'}', ${absBal})" 
                        class="btn text-xs px-3 py-1 w-auto ${isPos ? 'bg-green-600' : 'bg-red-600'}">تسوية</button>
            </div>
        </div>`;
    });
    container.innerHTML = html || '<p class="text-center text-gray-400 mt-10">لا توجد تسويات مطلوبة حالياً.</p>';
}

window.openSettleModal = function(uid, name, type, amount) {
    const settleModalEl = document.getElementById('settleModal');
    if (!settleModalEl) return;
    
    // تخزين متغيرات التسوية
    settleTargetUID = uid; settleTargetName = name; settleActionType = type; settleMaxAmount = amount;
    
    const summary = document.getElementById('settleSummary');
    const btn = document.getElementById('confirmSettleButton');
    
    // تحديث محتوى النافذة المنبثقة
    summary.innerHTML = `<p>تسوية مع: <strong>${name}</strong></p><p>المبلغ المطلوب: <span class="dir-ltr font-bold">${amount.toLocaleString()} SDG</span></p><p class="text-sm text-${type==='pay'?'red':'green'}-600">${type==='pay'?'أنت ستدفع':'أنت ستستلم'}</p>`;
    document.getElementById('settleAmountInput').value = amount.toLocaleString();
    document.getElementById('settleReference').value = '';
    btn.textContent = 'تأكيد'; btn.disabled = false;
    settleModalEl.classList.add('show');
};

window.confirmSettleUp = async function() {
    const settleAmountInputEl = document.getElementById('settleAmountInput');
    const settleReferenceEl = document.getElementById('settleReference');
    if(!settleAmountInputEl || !settleReferenceEl) return;
    
    const amount = parseFloat(settleAmountInputEl.value.replace(/,/g, ''));
    const refNum = settleReferenceEl.value;
    
    if (!amount || amount > settleMaxAmount + 0.01 || !refNum || refNum.length < 4) { 
        alert(`بيانات غير صحيحة. المبلغ لا يجب أن يتجاوز ${settleMaxAmount.toLocaleString()}`); 
        return; 
    }
    
    document.getElementById('confirmSettleButton').disabled = true;
    window.hideSettleModal(); 

    const updates = {};
    // إذا كنت تدفع، رصيدك ينقص (سالب). إذا كنت تستلم، رصيدك يزيد (موجب).
    const myChange = settleActionType === 'pay' ? -amount : amount;
    // إذا كنت تدفع، رصيد الآخر يزيد (موجب). إذا كنت تستلم، رصيد الآخر ينقص (سالب).
    const otherChange = settleActionType === 'pay' ? amount : -amount;

    const me = allUsers.find(u => u.uid === currentUserID);
    const other = allUsers.find(u => u.uid === settleTargetUID);
    
    updates[`users/${currentUserID}/balance`] = roundToTwo(me.balance + myChange);
    updates[`users/${settleTargetUID}/balance`] = roundToTwo(other.balance + otherChange);

    // تسجيل عملية التسوية نفسها (لتاريخ السجلات)
    const key = push(ref(db, 'settlements')).key;
    updates[`settlements/${key}`] = {
        amount, payer: settleActionType==='pay'?currentUserID:settleTargetUID, 
        receiver: settleActionType==='pay'?settleTargetUID:currentUserID,
        timestamp: Date.now(), reference: refNum
    };

    try {
        await update(ref(db), updates);
        document.getElementById('successModal')?.classList.add('show');
        loadData(); // إعادة تحميل البيانات لتحديث الأرصدة والملخص فوراً
    } catch(e) {
        alert('فشل التسوية. يرجى التحقق من قواعد الأمان.');
    }
};

// ============================================================
// 🔔 منطق الإشعارات (Notifications)
// ============================================================

window.openNotificationModal = function() {
    const list = document.getElementById('notificationsList');
    const modal = document.getElementById('notificationModal');
    if(!list || !modal) return;

    const myNotifs = allNotifications.filter(n => n.recipientId === currentUserID).sort((a,b) => b.timestamp - a.timestamp);

    let html = '';
    if(myNotifs.length === 0) html = '<p class="text-center text-gray-400">لا توجد إشعارات.</p>';
    myNotifs.forEach(n => {
        const { date } = formatBankDate(n.timestamp);
        html += `<div class="p-3 rounded border ${n.read ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'}"><p class="text-sm">${n.message}</p><span class="text-xs text-gray-400">${date}</span></div>`;
    });
    list.innerHTML = html;
    modal.classList.add('show');
};

window.markAllAsRead = async function() {
    const updates = {};
    allNotifications.filter(n => n.recipientId === currentUserID && !n.read).forEach(n => {
        updates[`notifications/${n.firebaseId}/read`] = true;
    });
    await update(ref(db), updates);
};

// ============================================================
// 🔄 تحميل البيانات والمصادقة (Load Data & Auth)
// ============================================================

function loadData() {
    if (!currentUserID) return;

    // جلب المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);

            updateCommonUI();
            populateParticipants(); 
        }
    });

    // جلب المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);
            
            // تحديث عرض السجلات إذا كنا في صفحة history.html
            if (document.getElementById('expensesContainer')) {
                 setFilter(activeFilter); 
            }
        } else {
            allExpenses = [];
        }
    });

    // جلب الإشعارات
    onValue(ref(db, 'notifications'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allNotifications = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] }));
            updateCommonUI();
        } else {
            allNotifications = [];
            updateCommonUI();
        }
    });
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();

        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) logoutBtn.onclick = () => auth.signOut().then(() => window.location.href = 'auth.html');
        
        // تفعيل الفلتر الافتراضي عند الدخول لصفحة السجل لأول مرة
        if (window.location.href.includes('history.html')) {
             // الانتظار قليلاً لضمان تحميل البيانات
             setTimeout(() => setFilter('30days', document.querySelector('.filter-pill.active')), 500);
        }

    } else {
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});