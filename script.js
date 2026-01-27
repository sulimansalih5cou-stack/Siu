// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
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

// متغيرات الحالة
let allUsers = [], currentUserID = null, currentUserDB = null;
let allExpenses = [], userNotifications = [], allSettlements = [];
let netBalances = {};

// متغيرات السجل والإشعارات (التمرير اللانهائي)
let itemsPerPage = 10, currentPage = 1, activeFilter = '30days', filteredHistory = [];
let notificationsPerPage = 10, currentNotificationPage = 1;
let isLoadingHistory = false, isLoadingNotifications = false;

// ============================================================
// 🛠️ دوال مساعدة
// ============================================================

const getUserNameById = (uid) => allUsers.find(u => u.uid === uid)?.displayName || 'مستخدم غير معروف';
const roundToTwo = (num) => Math.round(num * 100) / 100;

window.formatNumber = (input) => {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') input.value = parseFloat(value).toLocaleString('en-US');
};

function formatBankDate(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const dateObj = new Date(timestamp);
    return {
        date: `${dateObj.getDate()}-${dateObj.toLocaleString('ar-EG', { month: 'short' })}-${dateObj.getFullYear()}`,
        time: dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
}

// ============================================================
// 🏠 تحديث الواجهة والبيانات
// ============================================================

function updateHomeDisplay() {
    const balanceEl = document.getElementById('currentBalance');
    const namePlaceholder = document.getElementById('userNamePlaceholder');
    const sidebarName = document.getElementById('sidebarUserName');
    const balanceCard = document.getElementById('currentBalanceCard');

    const name = currentUserDB?.displayName || auth.currentUser?.displayName || "مستخدم";
    if (namePlaceholder) namePlaceholder.textContent = name;
    if (sidebarName) sidebarName.textContent = name;

    const balance = currentUserDB?.balance || 0;
    if (balanceEl) balanceEl.textContent = balance.toLocaleString('en-US', { minimumFractionDigits: 2 });
    
    if (balanceCard) {
        balance < -0.1 ? balanceCard.classList.add('negative') : balanceCard.classList.remove('negative');
    }
}

function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container || !currentUserID) return;
    container.innerHTML = allUsers.filter(u => u.uid !== currentUserID).map(user => `
        <div class="checkbox-item">
            <label class="flex items-center w-full cursor-pointer">
                <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-5 w-5 text-blue-600">
                <span class="mr-2 font-semibold text-gray-700">${user.displayName}</span>
            </label>
        </div>
    `).join('');
}

window.selectAllParticipants = () => {
    document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = true);
};

// ============================================================
// 💰 منطق المصروفات (Index)
// ============================================================

window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value.replace(/,/g, ''));
    const isMessenger = document.getElementById('isMessenger').checked;
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked');

    let uids = Array.from(checkboxes).map(cb => cb.dataset.uid);
    if (!isMessenger) uids.push(currentUserID);
    uids = [...new Set(uids)];

    if (!title || isNaN(amount) || amount <= 0 || uids.length < (isMessenger ? 1 : 2)) {
        alert("يرجى إكمال البيانات وتحديد المشاركين.");
        return;
    }

    const share = roundToTwo(amount / uids.length);
    window.tempExpenseData = { title, amount, share, participants: uids, isMessenger };

    document.getElementById('previewText').innerHTML = `
        <p><b>المصروف:</b> ${title}</p>
        <p><b>المبلغ:</b> ${amount.toLocaleString()} SDG</p>
        <p><b>حصة الفرد:</b> ${share.toLocaleString()} SDG</p>
        <p class="mt-4 text-blue-600 font-bold">حصتك: ${isMessenger ? '0.00' : share.toLocaleString()} SDG</p>
    `;
    document.getElementById('previewModal').classList.add('show');
};

window.handleSaveClick = async function(btn) {
    if (!window.tempExpenseData) return;
    if (window.tempExpenseData.isMessenger) {
        document.getElementById('previewDetails').style.display = 'none';
        document.getElementById('messengerConfirmation').style.display = 'block';
    } else {
        await window.saveExpense(btn);
    }
};

window.saveExpense = async function(btn) {
    const data = window.tempExpenseData;
    if (!data || isLoadingHistory) return;

    btn.disabled = true;
    btn.textContent = "جاري الحفظ...";

    const updates = {};
    const expenseKey = push(ref(db, 'expenses')).key;
    const timestamp = Date.now();

    // رصيد الدافع
    const payerCredit = data.isMessenger ? data.amount : roundToTwo(data.amount - data.share);
    updates[`users/${currentUserID}/balance`] = roundToTwo((currentUserDB.balance || 0) + payerCredit);

    // أرصدة المشاركين
    data.participants.filter(id => id !== currentUserID).forEach(uid => {
        const user = allUsers.find(u => u.uid === uid);
        if (user) {
            updates[`users/${uid}/balance`] = roundToTwo(user.balance - data.share);
            const notifKey = push(ref(db, 'notifications')).key;
            updates[`notifications/${notifKey}`] = {
                uid, message: `دين جديد: ${data.title} بقيمة ${data.share} لـ ${getUserNameById(currentUserID)}`,
                timestamp, is_read: false, type: 'debit'
            };
        }
    });

    updates[`expenses/${expenseKey}`] = { ...data, payer_id: currentUserID, participants_ids: data.participants, timestamp };

    try {
        await update(ref(db), updates);
        window.hideModal();
        document.getElementById('successModal').classList.add('show');
        document.getElementById('expenseForm').reset();
    } catch (e) {
        alert("خطأ في الحفظ");
    } finally {
        btn.disabled = false;
        btn.textContent = "تأكيد";
    }
};

// ============================================================
// 📜 منطق السجل (History) - التمرير اللانهائي
// ============================================================

function filterHistoryData() {
    const combined = [
        ...allExpenses.filter(e => e.payer_id === currentUserID || e.participants_ids.includes(currentUserID)).map(e => ({...e, type: 'expense'})),
        ...allSettlements.filter(s => s.payer_id === currentUserID || s.recipient_id === currentUserID).map(s => ({...s, type: 'settlement'}))
    ].sort((a, b) => b.timestamp - a.timestamp);

    filteredHistory = combined; // يمكن إضافة فلاتر الأيام هنا لاحقاً
}

function displayHistory(isAppending = false) {
    const container = document.getElementById('expensesContainer');
    if (!container) return;

    const start = (currentPage - 1) * itemsPerPage;
    const end = currentPage * itemsPerPage;
    const chunk = filteredHistory.slice(start, end);

    if (!isAppending) container.innerHTML = '';

    chunk.forEach(item => {
        const { date, time } = formatBankDate(item.timestamp);
        const isExpense = item.type === 'expense';
        const isPayer = item.payer_id === currentUserID;
        
        let amountText = "", cardClass = "", title = "";
        
        if (isExpense) {
            const val = isPayer ? (item.isMessenger ? item.amount : item.amount - item.share) : item.share;
            amountText = `${isPayer ? '+' : '-'} ${val.toLocaleString()}`;
            cardClass = isPayer ? 'amount-pos' : 'amount-neg';
            title = isPayer ? `مستحقات: ${item.title}` : `دين: ${item.title}`;
        } else {
            amountText = `${isPayer ? '-' : '+'} ${item.amount.toLocaleString()}`;
            cardClass = isPayer ? 'amount-neg' : 'amount-pos';
            title = isPayer ? `تسوية لـ ${getUserNameById(item.recipient_id)}` : `تسوية من ${getUserNameById(item.payer_id)}`;
        }

        container.innerHTML += `
            <div class="bankak-card">
                <div class="card-main-content">
                    <div class="details-text text-right">
                        <p class="transaction-title">${title}</p>
                        <p class="transaction-sub">${isExpense ? 'مصروفات' : 'تسوية بنكية'}</p>
                    </div>
                    <div class="amount-display ${cardClass}">${amountText} SDG</div>
                </div>
                <div class="card-footer-date"><span>${date} | ${time}</span></div>
            </div>
        `;
    });
}

function handleScroll() {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200 && !isLoadingHistory) {
        if (currentPage * itemsPerPage < filteredHistory.length) {
            currentPage++;
            displayHistory(true);
        }
    }
}

// ============================================================
// 🔔 الإشعارات
// ============================================================

window.showNotifications = () => {
    displayNotifications();
    document.getElementById('notificationModal').classList.add('show');
};

function displayNotifications() {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    
    list.innerHTML = userNotifications.map(n => `
        <div class="p-3 border-b ${n.is_read ? 'opacity-50' : 'bg-blue-50'}" onclick="markAsRead('${n.id}')">
            <p>${n.message}</p>
            <span class="text-xs text-gray-400">${formatBankDate(n.timestamp).date}</span>
        </div>
    `).join('') || '<p class="text-center p-4">لا توجد إشعارات</p>';

    const unread = userNotifications.filter(n => !n.is_read).length;
    const badge = document.getElementById('notificationBadge');
    badge.textContent = unread;
    unread > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
}

window.markAsRead = (id) => update(ref(db, `notifications/${id}`), { is_read: true });

// ============================================================
// 🔐 التشغيل والمراقبة
// ============================================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();
        if (window.location.href.includes('history.html')) window.addEventListener('scroll', handleScroll);
    } else {
        if (!window.location.href.includes('auth.html')) window.location.href = 'auth.html';
    }
});

function loadData() {
    onValue(ref(db, 'users'), snap => {
        allUsers = Object.keys(snap.val() || {}).map(k => ({uid: k, ...snap.val()[k]}));
        currentUserDB = allUsers.find(u => u.uid === currentUserID);
        updateHomeDisplay();
        populateParticipants();
    });

    onValue(ref(db, 'expenses'), snap => {
        allExpenses = Object.values(snap.val() || {});
        filterHistoryData();
        displayHistory();
    });

    onValue(ref(db, 'settlements'), snap => {
        allSettlements = Object.values(snap.val() || {});
        filterHistoryData();
        displayHistory();
    });

    onValue(ref(db, 'notifications'), snap => {
        const data = snap.val() || {};
        userNotifications = Object.keys(data).map(k => ({id: k, ...data[k]})).filter(n => n.uid === currentUserID).sort((a,b)=>b.timestamp - a.timestamp);
        displayNotifications();
    });
}

// دوال الإغلاق
window.hideModal = () => {
    document.getElementById('previewModal').classList.remove('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';
};
window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');
window.hideNotificationModal = () => document.getElementById('notificationModal').classList.remove('show');
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('open');
