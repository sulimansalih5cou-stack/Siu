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
let currentSettleMaxAmount = 0;

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
            document.getElementById('sidebarUserName').textContent = me.displayName;
            document.getElementById('sidebarUserEmail').textContent = auth.currentUser.email;
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
            exp.participants_ids.forEach(pid => { if(pid !== currentUserID) netBalances[pid] += share; });
        } else if (exp.participants_ids.includes(currentUserID)) {
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

    debtContainer.innerHTML = ''; claimList.innerHTML = '';

    Object.keys(netBalances).forEach(uid => {
        const bal = netBalances[uid];
        const name = allUsers.find(u => u.uid === uid)?.displayName || "مستخدم";
        if (bal < -0.5) {
            const amt = Math.abs(bal); tDebt += amt;
            debtContainer.innerHTML += `
                <div class="balance-card">
                    <div><p class="font-bold text-sm text-gray-800">${name}</p><p class="text-[10px] text-red-500">${amt.toLocaleString()} SDG</p></div>
                    <button onclick="showSettleModal('${name}', ${amt}, '${uid}')" class="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold">تسوية</button>
                </div>`;
        } else if (bal > 0.5) {
            tCredit += bal;
            claimList.innerHTML += `
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-xl mb-2">
                    <div><p class="font-bold text-xs">${name}</p><p class="text-green-600 font-bold text-xs">${bal.toLocaleString()} SDG</p></div>
                    <button onclick="nudgeUser('${name}', '${uid}', ${bal})" class="nudge-btn">نكز</button>
                </div>`;
        }
    });
    document.getElementById('totalDebt').textContent = tDebt.toLocaleString();
    document.getElementById('totalCredit').textContent = tCredit.toLocaleString();
    document.getElementById('noDebts').classList.toggle('hidden', tDebt > 0);
}

// --- ميزة النكز ---
window.nudgeUser = async (name, uid, amount) => {
    try {
        const notifKey = push(ref(db, 'notifications')).key;
        await update(ref(db, `notifications/${notifKey}`), {
            uid: uid,
            message: `🔔 نكز: يذكرك ${document.getElementById('sidebarUserName').textContent} بسداد مبلغ ${amount.toLocaleString()} SDG.`,
            timestamp: Date.now(), is_read: false
        });
        alert(`تم نكز ${name} بنجاح!`);
    } catch(e) { alert("فشل النكز"); }
};

// --- إشعارات (النظر يعني القراءة) ---
window.showNotifications = async () => {
    document.getElementById('notificationModal').classList.add('show');
    const list = document.getElementById('notificationsList');
    list.innerHTML = userNotifications.length === 0 ? '<p class="text-center py-10 opacity-50 text-xs">لا توجد إشعارات</p>' : 
        userNotifications.map(n => `
            <div class="p-3 rounded-xl border ${n.is_read ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'}">
                <p class="text-xs font-bold text-gray-800">${n.message}</p>
                <p class="text-[9px] text-gray-400 mt-1">${new Date(n.timestamp).toLocaleString('ar-EG')}</p>
            </div>`).join('');
    
    // تحديث الإشعارات لمقروءة فور الفتح
    const unread = userNotifications.filter(n => !n.is_read);
    if (unread.length > 0) {
        const updates = {};
        unread.forEach(n => updates[`notifications/${n.id}/is_read`] = true);
        await update(ref(db), updates);
    }
};

// --- التسوية وتنسيق الفواصل ---
window.showSettleModal = (name, amt, uid) => {
    currentSettleRecipientUID = uid; currentSettleMaxAmount = amt;
    document.getElementById('settleRelation').textContent = `تسوية لـ ${name}`;
    document.getElementById('maxSettleAmountDisplay').textContent = amt.toLocaleString();
    document.getElementById('settleAmount').value = amt.toLocaleString();
    document.getElementById('settleModal').classList.add('show');
};

document.getElementById('settleAmount').addEventListener('input', function(e) {
    let val = e.target.value.replace(/,/g, '');
    if (!isNaN(val) && val !== "") {
        e.target.value = Number(val).toLocaleString();
        const remaining = currentSettleMaxAmount - Number(val);
        const remDiv = document.getElementById('remainingBalance');
        remDiv.classList.remove('hidden');
        document.getElementById('remainingValue').textContent = remaining.toLocaleString();
    }
});

document.getElementById('settleForm').onsubmit = async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById('settleAmount').value.replace(/,/g, ''));
    const opNum = document.getElementById('operationNumber').value;
    if (amount <= 0 || amount > currentSettleMaxAmount + 1) return alert("المبلغ غير صحيح");

    try {
        const updates = {};
        const sKey = push(ref(db, 'settlements')).key;
        const nKey = push(ref(db, 'notifications')).key;
        updates[`settlements/${sKey}`] = { payer_id: currentUserID, recipient_id: currentSettleRecipientUID, amount, operation_number: opNum, timestamp: Date.now() };
        updates[`notifications/${nKey}`] = { uid: currentSettleRecipientUID, message: `✅ تسوية مستلمة: ${amount.toLocaleString()} SDG من ${document.getElementById('sidebarUserName').textContent}`, timestamp: Date.now(), is_read: false };
        await update(ref(db), updates);
        alert("تمت التسوية بنجاح");
        hideSettleModal();
    } catch(e) { alert("فشلت العملية"); }
};

// وظائف مساعدة
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('open');
window.hideSettleModal = () => document.getElementById('settleModal').classList.remove('show');
window.hideClaimModal = () => document.getElementById('claimModal').classList.remove('show');
window.showClaimModal = () => document.getElementById('claimModal').classList.add('show');
window.hideNotificationModal = () => document.getElementById('notificationModal').classList.remove('show');
function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    const count = userNotifications.filter(n => !n.is_read).length;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
}
document.getElementById('logoutBtn').onclick = () => signOut(auth);
