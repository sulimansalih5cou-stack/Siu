import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2GNsXj4DzWyCYLKuVT3i1XBKfjX3ccuM",
    authDomain: "siu-students.firebaseapp.com",
    databaseURL: "https://siu-students-default-rtdb.firebaseio.com",
    projectId: "siu-students",
    storageBucket: "siu-students.firebasestorage.app",
    messagingSenderId: "76007314543",
    appId: "1:76007314543:web:4850b668cec4b93bdc699a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUserID = null;
let allUsers = [];
let allExpenses = [];
let allSettlements = [];
let userNotifications = [];
let netBalances = {};
let currentSettleRecipientUID = '';
let currentSettleRecipientName = ''; // لتخزين الاسم وتجنب undefined
let currentSettleMaxAmount = 0;

// --- مراقبة حالة تسجيل الدخول ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();
    } else {
        window.location.href = 'auth.html';
    }
});

function loadData() {
    onValue(ref(db), (snapshot) => {
        const data = snapshot.val() || {};
        allUsers = data.users ? Object.keys(data.users).map(k => ({uid: k, ...data.users[k]})) : [];
        allExpenses = data.expenses ? Object.values(data.expenses) : [];
        allSettlements = data.settlements ? Object.values(data.settlements) : [];
        
        userNotifications = data.notifications ? Object.keys(data.notifications)
            .map(k => ({id: k, ...data.notifications[k]}))
            .filter(n => n.uid === currentUserID)
            .sort((a,b) => b.timestamp - a.timestamp) : [];

        const me = allUsers.find(u => u.uid === currentUserID);
        if (me) {
            const userNameEl = document.getElementById('sidebarUserName');
            const userEmailEl = document.getElementById('sidebarUserEmail');
            if(userNameEl) userNameEl.textContent = me.displayName;
            if(userEmailEl) userEmailEl.textContent = auth.currentUser.email;
        }

        calculateBalances();
        updateNotificationBadge();
    });
}

function calculateBalances() {
    netBalances = {};
    allUsers.forEach(u => { if(u.uid !== currentUserID) netBalances[u.uid] = 0; });

    allExpenses.forEach(exp => {
        const share = Number(exp.share) || 0;
        if (exp.payer_id === currentUserID) {
            if(exp.participants_ids) {
                exp.participants_ids.forEach(pid => { if(pid !== currentUserID) netBalances[pid] += share; });
            }
        } else if (exp.participants_ids && exp.participants_ids.includes(currentUserID)) {
            netBalances[exp.payer_id] -= share;
        }
    });

    allSettlements.forEach(set => {
        const amt = Number(set.amount) || 0;
        if (set.payer_id === currentUserID) netBalances[set.recipient_id] += amt;
        else if (set.recipient_id === currentUserID) netBalances[set.payer_id] -= amt;
    });
    renderUI();
}

function renderUI() {
    const debtContainer = document.getElementById('debtContainer');
    const claimList = document.getElementById('claimList');
    let tDebt = 0, tCredit = 0;
    if(!debtContainer || !claimList) return;

    debtContainer.innerHTML = ''; claimList.innerHTML = '';

    Object.keys(netBalances).forEach(uid => {
        const bal = netBalances[uid];
        const userObj = allUsers.find(u => u.uid === uid);
        const name = userObj ? userObj.displayName : "مستخدم";

        if (bal < -0.5) {
            const amt = Math.abs(bal); 
            tDebt += amt;
            debtContainer.innerHTML += `
                <div class="balance-card">
                    <div>
                        <p class="font-bold text-sm text-gray-800">${name}</p>
                        <p class="text-[10px] text-red-500">${amt.toLocaleString('en-US')} SDG</p>
                    </div>
                    <button onclick="showSettleModal('${name}', ${amt}, '${uid}')" class="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold">تسوية</button>
                </div>`;
        } else if (bal > 0.5) {
            tCredit += bal;
            claimList.innerHTML += `
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-xl mb-2">
                    <div>
                        <p class="font-bold text-xs">${name}</p>
                        <p class="text-green-600 font-bold text-xs">${bal.toLocaleString('en-US')} SDG</p>
                    </div>
                    <button onclick="nudgeUser('${name}', '${uid}', ${bal})" class="nudge-btn">نكز</button>
                </div>`;
        }
    });
    document.getElementById('totalDebt').textContent = tDebt.toLocaleString('en-US');
    document.getElementById('totalCredit').textContent = tCredit.toLocaleString('en-US');
    document.getElementById('noDebts').classList.toggle('hidden', tDebt > 0);
}

// --- منطق التسوية المطور ---

window.showSettleModal = (name, amt, uid) => {
    currentSettleRecipientUID = uid; 
    currentSettleRecipientName = name; // حفظ الاسم هنا لمنع undefined
    currentSettleMaxAmount = amt;

    document.getElementById('settleRelation').textContent = `تسوية لـ ${name}`;
    document.getElementById('maxSettleAmountDisplay').textContent = amt.toLocaleString('en-US');

    // تفريغ الحقول تماماً
    document.getElementById('settleAmount').value = "";
    document.getElementById('operationNumber').value = "";
    
    updateRemainingBalance(0);
    document.getElementById('settleModal').classList.add('show');
};

function updateRemainingBalance(val) {
    const cleanVal = Number(String(val).replace(/,/g, '')) || 0;
    const remaining = currentSettleMaxAmount - cleanVal;
    const remValueSpan = document.getElementById('remainingValue');
    if(remValueSpan) {
        remValueSpan.textContent = remaining.toLocaleString('en-US');
        remValueSpan.style.color = remaining < 0 ? "#ef4444" : "#6b7280";
    }
}

document.getElementById('settleAmount').addEventListener('input', function(e) {
    let rawValue = e.target.value.replace(/[^0-9]/g, ''); 
    if (rawValue !== "") {
        updateRemainingBalance(rawValue);
        e.target.value = Number(rawValue).toLocaleString('en-US');
    } else {
        updateRemainingBalance(0);
    }
});

document.getElementById('settleForm').onsubmit = async (e) => {
    e.preventDefault();
    const amountStr = document.getElementById('settleAmount').value.replace(/,/g, '');
    const amount = Number(amountStr);
    const opNum = document.getElementById('operationNumber').value;
    const myName = document.getElementById('sidebarUserName').textContent;

    if (!amountStr || amount <= 0) return alert("يرجى إدخال مبلغ صحيح");
    if (opNum.length !== 4) return alert("يجب أن يتكون رقم العملية من 4 أرقام بالضبط");

    try {
        const updates = {};
        const timestamp = Date.now();
        const sKey = push(ref(db, 'settlements')).key;
        const nKey = push(ref(db, 'notifications')).key;
        const eKey = push(ref(db, 'expenses')).key;

        updates[`settlements/${sKey}`] = { 
            payer_id: currentUserID, 
            recipient_id: currentSettleRecipientUID, 
            amount: amount, 
            operation_number: opNum, 
            timestamp: timestamp 
        };

        // إضافة التسوية كمصروف شخصي مع اسم الشخص الصحيح
        updates[`expenses/${eKey}`] = {
            payer_id: currentUserID,
            participants_ids: [currentUserID],
            share: amount,
            description: `تسوية دين إلى: ${currentSettleRecipientName}`, // تم الإصلاح هنا
            timestamp: timestamp,
            type: 'settlement_expense'
        };

        updates[`notifications/${nKey}`] = { 
            uid: currentSettleRecipientUID, 
            message: `✅ تسوية مستلمة: ${amount.toLocaleString('en-US')} SDG من ${myName}`, 
            timestamp: timestamp, 
            is_read: false 
        };

        await update(ref(db), updates);
        alert("تمت التسوية بنجاح!");
        hideSettleModal();
        e.target.reset();
    } catch(err) { alert("فشلت العملية"); }
};

// --- الإشعارات ---
window.showNotifications = async () => {
    document.getElementById('notificationModal').classList.add('show');
    const list = document.getElementById('notificationsList');
    if(!list) return;

    if (userNotifications.length === 0) {
        list.innerHTML = '<p class="text-center py-10 opacity-50 text-xs">لا توجد إشعارات</p>';
    } else {
        list.innerHTML = userNotifications.map(n => `
            <div class="p-3 rounded-xl border ${n.is_read ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'} mb-2">
                <p class="text-xs font-bold text-gray-800">${n.message}</p>
                <p class="text-[9px] text-gray-400 mt-1">${new Date(n.timestamp).toLocaleString('ar-EG')}</p>
            </div>`).join('');
    }

    const unread = userNotifications.filter(n => !n.is_read);
    if (unread.length > 0) {
        const notifUpdates = {};
        unread.forEach(n => notifUpdates[`notifications/${n.id}/is_read`] = true);
        await update(ref(db), notifUpdates);
    }
};

// --- وظائف عامة ---
window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    } else {
        console.error("Sidebar element not found!");
    }
};

window.hideSettleModal = () => document.getElementById('settleModal').classList.remove('show');
window.hideNotificationModal = () => document.getElementById('notificationModal').classList.remove('show');

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if(!badge) return;
    const count = userNotifications.filter(n => !n.is_read).length;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
}

const logoutBtn = document.getElementById('logoutBtn');
if(logoutBtn) logoutBtn.onclick = () => signOut(auth);
