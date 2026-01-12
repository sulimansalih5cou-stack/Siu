// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 1. إعدادات Firebase
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

// 2. متغيرات الحالة
let currentUserID = null;
let allUsers = [];
let allExpenses = [];
let allSettlements = [];
let windowData = { recipientUID: null, maxAmount: 0 };

// 3. مراقبة حالة الدخول
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        document.getElementById('sidebarUserEmail').textContent = user.email;
        loadData();
    } else {
        window.location.href = 'auth.html';
    }
});

// 4. جلب البيانات من Firebase
function loadData() {
    onValue(ref(db), (snapshot) => {
        const data = snapshot.val() || {};
        allUsers = data.users ? Object.keys(data.users).map(k => ({uid: k, ...data.users[k]})) : [];
        allExpenses = data.expenses ? Object.values(data.expenses) : [];
        allSettlements = data.settlements ? Object.values(data.settlements) : [];
        
        const currentUser = allUsers.find(u => u.uid === currentUserID);
        if (currentUser) document.getElementById('sidebarUserName').textContent = currentUser.displayName;
        
        updateUI();
    });
}

// 5. منطق الحسابات وتحديث الواجهة
function updateUI() {
    let balances = {};
    allUsers.forEach(u => { if(u.uid !== currentUserID) balances[u.uid] = 0; });

    // حساب الديون من المصروفات
    allExpenses.forEach(exp => {
        const share = Number(exp.share) || 0;
        if (exp.payer_id === currentUserID) {
            exp.participants_ids.forEach(pid => { if(pid !== currentUserID) balances[pid] += share; });
        } else if (exp.participants_ids.includes(currentUserID)) {
            balances[exp.payer_id] -= share;
        }
    });

    // حساب التسويات
    allSettlements.forEach(set => {
        const amt = Number(set.amount) || 0;
        if (set.payer_id === currentUserID) balances[set.recipient_id] += amt;
        else if (set.recipient_id === currentUserID) balances[set.payer_id] -= amt;
    });

    renderBalances(balances);
}

function renderBalances(balances) {
    const debtContainer = document.getElementById('debtContainer');
    const claimList = document.getElementById('claimList');
    let totalD = 0, totalC = 0;

    debtContainer.innerHTML = '';
    claimList.innerHTML = '';

    Object.keys(balances).forEach(uid => {
        const bal = balances[uid];
        const name = allUsers.find(u => u.uid === uid)?.displayName || "مستخدم";
        
        if (bal < -0.5) {
            const amt = Math.abs(bal);
            totalD += amt;
            debtContainer.innerHTML += `
                <div class="balance-card">
                    <div class="balance-info"><span class="balance-name">${name}</span><span class="balance-amount">${amt.toLocaleString()} SDG</span></div>
                    <button class="action-button" onclick="showSettleModal('${name}', ${amt}, '${uid}')">تسوية</button>
                </div>`;
        } else if (bal > 0.5) {
            totalC += bal;
            claimList.innerHTML += `
                <div class="claim-item">
                    <span>${name}: <b>${bal.toLocaleString()}</b></span>
                    <button class="nudge-button-individual" onclick="nudgeUser('${uid}', '${name}')">نكز</button>
                </div>`;
        }
    });

    document.getElementById('totalDebt').textContent = totalD.toLocaleString();
    document.getElementById('totalCredit').textContent = totalC.toLocaleString();
    document.getElementById('noDebts').classList.toggle('hidden', totalD > 0);
}

// 6. التعامل مع التسوية (Submit)
document.getElementById('settleForm').onsubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('settleAmount').value);
    const opNum = document.getElementById('operationNumber').value;

    if (amount <= 0 || amount > windowData.maxAmount + 1) return alert("المبلغ غير صحيح");

    try {
        const newRef = push(ref(db, 'settlements'));
        const updates = {};
        updates[`settlements/${newRef.key}`] = {
            payer_id: currentUserID,
            recipient_id: windowData.recipientUID,
            amount: amount,
            operation_number: opNum,
            timestamp: Date.now()
        };
        
        await update(ref(db), updates);
        alert("تم إرسال التسوية بنجاح");
        hideSettleModal();
    } catch (err) { alert("خطأ في العملية"); }
};

// 7. الوظائف العالمية (Window Functions)
window.showSettleModal = (name, amt, uid) => {
    windowData = { recipientUID: uid, maxAmount: amt };
    document.getElementById('settleRelation').textContent = `تسوية لـ ${name}`;
    document.getElementById('maxSettleAmountDisplay').textContent = amt.toLocaleString();
    document.getElementById('settleAmount').value = amt;
    document.getElementById('settleModal').classList.add('show');
};

window.hideSettleModal = () => document.getElementById('settleModal').classList.remove('show');
window.showClaimModal = () => document.getElementById('claimModal').classList.add('show');
window.hideClaimModal = () => document.getElementById('claimModal').classList.remove('show');
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('open');
window.closeSidebar = () => document.getElementById('sidebar').classList.remove('open');

window.nudgeUser = (uid, name) => {
    const notifRef = push(ref(db, 'notifications'));
    update(ref(db, `notifications/${notifRef.key}`), {
        uid: uid,
        message: `تذكير من ${auth.currentUser.displayName}: يرجى تسوية المبالغ المستحقة.`,
        timestamp: Date.now(),
        is_read: false
    });
    alert(`تم إرسال نكز لـ ${name}`);
};

document.getElementById('logoutBtn').onclick = () => signOut(auth);
document.getElementById('menuButton').onclick = window.toggleSidebar;
