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

// متغيرات عامة
let allUsers = []; 
let currentUserID = null; 
let currentUserDB = null; 
let allExpenses = [];
let activeFilter = '30days'; 
let userNotifications = []; 

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

    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;

    if (nameEl) nameEl.textContent = displayName;

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
// 📊 منطق المصروفات الشخصية (My Expenses Logic)
// ============================================================

function displayPersonalExpenses() {
    const container = document.getElementById('personalExpensesContainer');
    const noExpensesEl = document.getElementById('noPersonalExpenses');
    if (!container) return; 
    
    container.innerHTML = '';
    
    const personalList = allExpenses.filter(expense => 
        expense.participants_ids.includes(currentUserID)
    ).sort((a, b) => b.timestamp - a.timestamp);

    if (personalList.length === 0) {
        if(noExpensesEl) noExpensesEl.classList.remove('hidden');
        return;
    }
    if(noExpensesEl) noExpensesEl.classList.add('hidden');

    personalList.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isMessenger = expense.is_messenger || false;
        const share = expense.share;
        
        let displayAmount;
        let mainTitle;
        let colorClass = "amount-neg"; 
        let iconClass = "icon-danger";
        
        const { date, time } = formatBankDate(expense.timestamp);

        if (isPayer && isMessenger && share < 0.1) return; 
        
        if (isPayer && !isMessenger) {
            displayAmount = share;
            mainTitle = `حصتك الخاصة في مصروف: ${expense.title}`;
        } else if (expense.participants_ids.includes(currentUserID) && !isPayer) {
            displayAmount = share;
            const payerName = getUserNameById(expense.payer_id);
            mainTitle = `دين عليك لـ ${payerName} في مصروف: ${expense.title}`;
        } else {
            return; 
        }

        const amountDisplay = displayAmount.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2});

        const cardHTML = `
        <div class="bankak-card">
            <div class="card-main-content">
                <div class="amount-display ${colorClass}">
                    - ${amountDisplay}
                </div>
                <div class="details-wrapper">
                    <div class="bank-icon-container ${iconClass} ml-3">
                        <span class="font-bold text-xs">ج.س</span>
                        <div class="arrow-badge text-red-600">
                            <i class="fas fa-arrow-up"></i>
                        </div>
                    </div>
                    <div class="details-text text-right">
                        <p class="transaction-title">${expense.title}</p>
                        <p class="transaction-sub">
                            ${mainTitle}<br>
                            <span class="text-xs opacity-80">التاريخ: ${date} | الساعة: ${time}</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
        `;
        container.innerHTML += cardHTML;
    });
}


// ============================================================
// 💰 منطق ملخص التسوية (Settlement Summary Logic)
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
        const isMessenger = expense.is_messenger || false;

        if (payerId === currentUserID) {
            
            if (isMessenger) {
                expense.participants_ids.forEach(participantId => {
                    if (netBalances.hasOwnProperty(participantId)) { 
                        netBalances[participantId] = roundToTwo(netBalances[participantId] + share);
                    }
                });
            } else {
                allUsers.forEach(user => {
                    if (user.uid !== currentUserID && expense.participants_ids.includes(user.uid)) {
                        netBalances[user.uid] = roundToTwo(netBalances[user.uid] + share);
                    }
                });
            }
        } 
        else if (expense.participants_ids.includes(currentUserID) && payerId !== currentUserID) {
             netBalances[payerId] = roundToTwo(netBalances[payerId] - share);
        }
    });

    // توليد العرض
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
            summaryText = `أنت داير من **${otherUserName}** مبلغ:`;
            colorClass = "text-green-600 border-green-200 bg-green-50";
        } else {
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
// 📜 منطق صفحة السجلات (History Logic)
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
        return isPayer || isParticipant; 
    }).filter(expense => {
        if (activeFilter === '30days') return (now - expense.timestamp) <= (30 * oneDay);
        if (activeFilter === '3months') return (now - expense.timestamp) <= (90 * oneDay);

        const isCurrentUserPayer = expense.payer_id === currentUserID;
        if (activeFilter === 'incoming') return isCurrentUserPayer; 
        
        const isCurrentUserParticipant = expense.participants_ids.includes(currentUserID);
        if (activeFilter === 'outgoing') return !isCurrentUserPayer && isCurrentUserParticipant; 
        
        return true; 
    });


    if (filteredList.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 mt-10">لا توجد سجلات مطابقة.</p>';
        return;
    }

    filteredList.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isMessenger = expense.is_messenger || false; 
        const share = expense.share;
        let netAmount = 0;
        let isPositive = false;
        let mainTitle = "";
        let detailsText = "";

        if (isPayer) {
            if (isMessenger) {
                netAmount = expense.amount; 
                isPositive = true;
                const otherParticipantsCount = expense.participants_ids.length;
                mainTitle = `مرسال: استرداد من ${otherParticipantsCount} مشارك`;
                detailsText = `دفعت ${expense.amount.toLocaleString(undefined, {maximumFractionDigits: 1})} بالنيابة (حصتك 0)`;
            } else {
                netAmount = expense.amount - share; 
                isPositive = true;
                const otherParticipantsCount = expense.participants_ids.length - 1;
                mainTitle = `استرداد من ${otherParticipantsCount} مشارك`;
                detailsText = `حصتك: ${share.toLocaleString(undefined, {maximumFractionDigits: 1})} SDG`;
            }

        } else if (expense.participants_ids.includes(currentUserID)) {
            netAmount = share;
            isPositive = false;
            const payerName = getUserNameById(expense.payer_id);
            mainTitle = `مشاركة في مصروف: ${payerName}`;
            detailsText = `حصتك المطلوبة`;
        } else {
            return;
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
// 🔔 منطق الإشعارات (Notifications Logic)
// ============================================================

function loadNotifications() {
    if (!currentUserID) return;

    onValue(ref(db, 'notifications'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            
            userNotifications = Object.keys(val)
                .map(key => ({ id: key, ...val[key] }))
                .filter(n => n.uid === currentUserID)
                .sort((a, b) => b.timestamp - a.timestamp); 
            
            displayNotifications();
        } else {
            userNotifications = [];
            displayNotifications();
        }
    });
}

function displayNotifications() {
    const listContainer = document.getElementById('notificationsList');
    const badge = document.getElementById('notificationBadge');
    
    if (!listContainer || !badge) return;

    const unreadCount = userNotifications.filter(n => !n.is_read).length;
    
    // تحديث زر الجرس (Badge)
    badge.textContent = unreadCount;
    if (unreadCount > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    // ملء قائمة الإشعارات
    listContainer.innerHTML = '';
    if (userNotifications.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد إشعارات حالياً.</p>';
        return;
    }

    userNotifications.slice(0, 10).forEach(notification => { 
        const statusClass = notification.is_read ? 'text-gray-500 bg-gray-50' : 'font-semibold bg-blue-50 hover:bg-blue-100';
        const icon = notification.type === 'debit' ? 'fa-minus-circle text-red-500' : 'fa-info-circle text-blue-500';
        const { date, time } = formatBankDate(notification.timestamp);

        const notifHTML = `
            <div class="p-3 rounded-lg border cursor-pointer transition ${statusClass}" data-id="${notification.id}" onclick="markNotificationAsRead('${notification.id}')">
                <p><i class="fas ${icon} ml-1"></i> ${notification.message}</p>
                <p class="text-xs mt-1 text-gray-400">
                    <i class="far fa-clock ml-1"></i> ${time} - ${date}
                </p>
            </div>
        `;
        listContainer.innerHTML += notifHTML;
    });
}

window.showNotifications = function() {
    document.getElementById('notificationModal').classList.add('show');
};

window.hideNotificationModal = function() {
    document.getElementById('notificationModal').classList.remove('show');
};

window.markNotificationAsRead = async function(notificationId) {
    const notificationRef = ref(db, `notifications/${notificationId}`);
    try {
        await update(notificationRef, { is_read: true });
        window.hideNotificationModal(); 
    } catch(e) {
        console.error("Error marking notification as read:", e);
    }
};


// ============================================================
// 💾 منطق الحفظ (Save Expense)
// ============================================================

window.handleSaveClick = function() {
    const isMessenger = document.getElementById('isMessenger').checked;
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);
    
    // 🔥 يتم تعديل الرسالة داخل المودال قبل عرضه
    if (isMessenger) {
        const confirmationEl = document.getElementById('messengerConfirmation');
        const detailsEl = document.getElementById('previewDetails');
        
        const warningContent = confirmationEl.querySelector('.messenger-warning p:first-of-type');
        warningContent.innerHTML = `أنت على وشك تسجيل المصروف كـ **مُرسال**. هذا يعني أنك دفعت المبلغ ${amount.toLocaleString()} SDG بالنيابة عن المشاركين، وحصتك ستكون **صفراً**.`;

        detailsEl.style.display = 'none';
        confirmationEl.style.display = 'block';
    } else {
        saveExpense();
    }
};

window.previewExpense = function() {
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';

    const title = document.getElementById('expenseTitle').value;
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const isMessenger = document.getElementById('isMessenger').checked; 

    if (!title || isNaN(amount) || amount <= 0) {
        alert('الرجاء إدخال البيانات بشكل صحيح');
        return;
    }

    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    let participants = Array.from(checkboxes).map(cb => cb.getAttribute('data-uid'));
    
    if (!isMessenger && !participants.includes(currentUserID)) {
        participants.push(currentUserID); 
    }

    if (isMessenger && participants.length === 0) {
        alert('عند اختيار "دفعت كمرسال"، يجب تحديد المشاركين ليتم تقسيم المبلغ عليهم.');
        return;
    }
    
    const effectiveParticipantsCount = participants.length;
    const finalShare = roundToTwo(amount / effectiveParticipantsCount);
    
    document.getElementById('mainSaveButton').textContent = isMessenger ? 'متابعة إلى التأكيد' : 'حفظ';

    const text = `
        <ul class="list-disc pr-4 space-y-2 text-right" dir="rtl">
            <li><b>المصروف:</b> ${title}</li>
            <li><b>المبلغ:</b> ${amount.toLocaleString()} SDG</li>
            <li><b>الدافع الفعلي:</b> أنت (${getUserNameById(currentUserID)})</li>
            <li><b>عدد المشاركين:</b> ${effectiveParticipantsCount} ${isMessenger ? ' (سترد المبلغ كاملاً)' : ''}</li>
            <li><b>نصيب الفرد:</b> ${finalShare.toLocaleString(undefined, {maximumFractionDigits: 2})} SDG</li>
        </ul>
    `;
    document.getElementById('previewText').innerHTML = text;

    const today = new Date().toISOString().split('T')[0];
    const isDuplicate = allExpenses.some(e => e.date === today && e.title === title && e.amount === amount);
    
    document.getElementById('warning').style.display = isDuplicate ? 'block' : 'none';

    document.getElementById('previewModal').classList.add('show');
};

window.saveExpense = async function() {
    window.hideModal();
    const title = document.getElementById('expenseTitle').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value.replace(/,/g, ''));
    const isMessenger = document.getElementById('isMessenger').checked; 
    
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    let participantsIDs = Array.from(checkboxes).map(cb => cb.getAttribute('data-uid'));
    
    if (!isMessenger && !participantsIDs.includes(currentUserID)) {
        participantsIDs.push(currentUserID); 
    }
    
    const effectiveParticipantsCount = participantsIDs.length;
    
    if (effectiveParticipantsCount === 0) return;

    const finalShare = roundToTwo(amount / effectiveParticipantsCount);
    const updates = {};
    const payerID = currentUserID;

    // تحديث الأرصدة
    allUsers.forEach(user => {
        let finalBalance = user.balance || 0;

        if (user.uid === payerID) {
            finalBalance += amount;
            
            if (!isMessenger) {
                finalBalance -= finalShare;
            }
        } 
        
        else if (participantsIDs.includes(user.uid)) {
            finalBalance -= finalShare;
        }

        updates[`users/${user.uid}/balance`] = roundToTwo(finalBalance);
    });

    const newKey = push(ref(db, 'expenses')).key;
    updates[`expenses/${newKey}`] = {
        title, amount, 
        share: finalShare,
        payer_id: payerID, 
        participants_ids: participantsIDs,
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0],
        is_messenger: isMessenger 
    };

    // منطق الإشعارات
    const notificationsUpdates = {};
    const notificationTime = Date.now();
    const payerName = getUserNameById(payerID);

    participantsIDs.forEach(participantID => {
        if (participantID !== payerID) { 
            const newNotifKey = push(ref(db, 'notifications')).key;
            notificationsUpdates[`notifications/${newNotifKey}`] = {
                uid: participantID, 
                message: `تم خصم ${finalShare.toLocaleString()} SDG كحصة لك في مصروف "${title}" دفعه ${payerName}.`,
                timestamp: notificationTime,
                is_read: false,
                type: 'debit',
                expense_id: newKey
            };
        }
    });
    
    if (isMessenger) {
        participantsIDs.forEach(participantID => {
            if (participantID !== payerID) { // عدم إرسال إشعار المرسال لنفسه
                 const newNotifKey = push(ref(db, 'notifications')).key;
                 notificationsUpdates[`notifications/${newNotifKey}`] = {
                    uid: participantID, 
                    message: `${payerName} دفع مبلغ ${amount.toLocaleString()} SDG كـ "مرسال" عنك وعن المشاركين. حصتك: ${finalShare.toLocaleString()} SDG.`,
                    timestamp: notificationTime,
                    is_read: false,
                    type: 'messenger',
                    expense_id: newKey
                 };
            }
        });
    }

    const allUpdates = { ...updates, ...notificationsUpdates }; 

    try {
        await update(ref(db), allUpdates);
        document.getElementById('successModal').classList.add('show');
        document.getElementById('expenseForm').reset();
        document.querySelectorAll('#participantsCheckboxes input[type=checkbox]').forEach(c => c.checked = false); 
        document.getElementById('isMessenger').checked = false;
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
            displayPersonalExpenses(); 
        } else {
            allExpenses = [];
            calculateSettlementSummary();
            displayHistory();
            displayPersonalExpenses(); 
        }
    });

    // جلب الإشعارات
    loadNotifications(); 
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
window.hideModal = () => {
    document.getElementById('previewModal').classList.remove('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';
};
window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');