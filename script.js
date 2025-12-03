// 🔥 تهيئة واستيراد Firebase SDK
// يجب التأكد من صحة إصدارات المكتبات وروابطها
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase - يجب تغيير هذه القيم إلى إعدادات مشروعك
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
    console.error("Firebase Initialization Error: Check your firebaseConfig object.", e);
    alert("خطأ حاسم في تهيئة الاتصال بقاعدة البيانات. تحقق من إعدادات Firebase.");
}


// ============================================================
// 🌐 المتغيرات العامة والحالة (Global Variables)
// ============================================================
let allUsers = [];
let currentUserID = null;
let currentUserDB = null;
let allExpenses = [];
let allSettlements = [];
let netBalances = {}; // أرصدة صافية لكل مستخدم آخر بالنسبة لي

// متغيرات التحكم في الفلاتر والتحميل الكسول
let activeFilter = '30days'; // الفلتر النشط الافتراضي لصفحة history
let historyDisplayLimit = 10; 
let currentHistoryIndex = 0; 


// ============================================================
// 🛠️ دوال مساعدة عامة (Utility Functions)
// ============================================================
function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم غير معروف';
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
    const month = dateObj.toLocaleString('ar-EG', { month: 'short' });
    const year = dateObj.getFullYear();
    const date = `${day}-${month}-${year}`;
    const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { date, time };
}


// ============================================================
// 🏠 منطق الصفحة الرئيسية (Index Logic - إضافة مصروف)
// ============================================================

// تحديث اسم المستخدم في الهيدر والقائمة الجانبية
function updateHomeDisplay() {
    const nameEl = document.getElementById('userNamePlaceholder');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarEmail = document.getElementById('sidebarUserEmail');
    
    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;

    if (nameEl) nameEl.textContent = displayName;
    if (sidebarName) sidebarName.textContent = displayName;
    
    if (sidebarEmail && auth.currentUser) sidebarEmail.textContent = auth.currentUser.email || '';
    
    // ربط زر الخروج
    const logoutBtn = document.getElementById('logoutSidebarButton');
    if (logoutBtn) {
        logoutBtn.onclick = (e) => {
            e.preventDefault();
            auth.signOut().then(() => {
                window.location.href = 'auth.html';
            });
        };
    }
}

// تعبئة قائمة المشاركين في نموذج الإضافة
window.populateParticipants = function() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;

    container.innerHTML = '';
    
    const currentUser = allUsers.find(u => u.uid === currentUserID);
    if (currentUser) {
        container.innerHTML += `
            <label class="checkbox-item bg-blue-100 border-blue-400">
                <input type="checkbox" id="user_${currentUser.uid}" value="${currentUser.uid}" checked disabled data-name="${currentUser.displayName}">
                <span class="font-bold text-blue-800">${currentUser.displayName} (أنت)</span>
            </label>
        `;
    }

    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        container.innerHTML += `
            <label class="checkbox-item">
                <input type="checkbox" id="user_${user.uid}" value="${user.uid}" checked data-name="${user.displayName}">
                <span>${user.displayName}</span>
            </label>
        `;
    });
    
    document.getElementById('isMessenger').onchange = toggleMessengerMode;
    toggleMessengerMode();
}

// دالة التحكم بوضع المرسال
function toggleMessengerMode() {
    const isMessenger = document.getElementById('isMessenger').checked;
    const myCheckbox = document.getElementById(`user_${currentUserID}`);
    
    if (myCheckbox) {
        if (isMessenger) {
            myCheckbox.checked = false; // أنت تدفع ولكن حصتك صفر
        } else {
            myCheckbox.checked = true; // أنت مشارك وحصتك تحسب
        }
        // myCheckbox.disabled يبقى true دائماً لمنع المستخدم من إلغاء تحديده يدوياً
    }
}

// تحديد كل المشاركين
window.selectAllParticipants = function() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:not([disabled])');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

// عرض الرصيد في بطاقة الصفحة الرئيسية
window.updateBalanceDisplay = function() {
    const balanceCard = document.getElementById('currentBalanceCard');
    const balanceEl = document.getElementById('currentBalance');
    
    if (!balanceEl || !balanceCard) return;

    let totalNetBalance = 0;
    for (const uid in netBalances) {
        // نجمع الأرصدة الصافية مع كل شخص آخر
        totalNetBalance += netBalances[uid];
    }
    
    const formattedBalance = Math.abs(totalNetBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    balanceEl.textContent = formattedBalance;
    
    if (totalNetBalance >= 0) {
        // أنت دائن أو رصيدك صفر (أخضر)
        balanceCard.classList.remove('negative');
        balanceCard.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
        balanceCard.querySelector('h3').innerHTML = `<i class="fas fa-arrow-up-circle ml-1"></i> رصيدك المستحق:`;
    } else {
        // أنت مدين (أحمر)
        balanceCard.classList.add('negative');
        balanceCard.style.background = 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)';
        balanceCard.querySelector('h3').innerHTML = `<i class="fas fa-arrow-down-circle ml-1"></i> دين عليك صافي:`;
    }
}

// دالة المعاينة والتحقق (Preview)
window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value.trim();
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const isMessenger = document.getElementById('isMessenger').checked;
    
    // نحصل على المشاركين الذين تم تحديدهم، سواء تم تعطيل مربع الاختيار الخاص بهم أم لا
    const participantCheckboxes = Array.from(document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked'));
    const participants = participantCheckboxes.filter(cb => cb.checked).map(cb => ({
        uid: cb.value,
        name: cb.getAttribute('data-name') || getUserNameById(cb.value)
    }));

    if (!title || isNaN(amount) || amount <= 0 || participants.length === 0) {
        alert('الرجاء إدخال اسم ومبلغ صحيح وتحديد مشارك واحد على الأقل.');
        return;
    }

    // حساب حصة كل مشارك
    // إذا كنت مرسالاً، عدد المشاركين هو كل من تم تحديدهم (بما فيهم أنت كدافع حصته صفر)
    const shareCount = participants.length;
    const share = roundToTwo(amount / shareCount);

    // تجهيز نص المعاينة
    let myCalculatedShare = isMessenger ? 0 : share;

    let previewHTML = `
        <p><strong>المصروف:</strong> ${title}</p>
        <p><strong>المبلغ الكلي:</strong> ${amount.toLocaleString('en-US')} SDG</p>
        <p><strong>الدافع:</strong> ${getUserNameById(currentUserID)} (أنت)</p>
        <p><strong>حالتك في المصروف:</strong> ${isMessenger ? 'مُرسال (حصتك 0 SDG)' : 'مشارك رئيسي'}</p>
        <p><strong>حصـة الفـرد (لغير المرسال):</strong> ${share.toLocaleString('en-US')} SDG</p>
        <p><strong>المشاركون:</strong> ${participants.map(p => p.name).join(', ')}</p>
    `;

    // عرض شاشات التأكيد المناسبة
    if (isMessenger) {
        document.getElementById('previewDetails').style.display = 'none';
        document.getElementById('messengerConfirmation').style.display = 'block';
    } else {
        document.getElementById('previewText').innerHTML = previewHTML;
        document.getElementById('previewDetails').style.display = 'block';
        document.getElementById('messengerConfirmation').style.display = 'none';
    }

    document.getElementById('previewModal').classList.add('show');
}

// دالة حفظ المصروف في Firebase
window.saveExpense = function() {
    document.getElementById('previewModal').classList.remove('show');
    
    const title = document.getElementById('expenseTitle').value.trim();
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const isMessenger = document.getElementById('isMessenger').checked;
    
    const participantCheckboxes = Array.from(document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked'));
    const participants_ids = participantCheckboxes.filter(cb => cb.checked).map(cb => cb.value);

    if (isNaN(amount) || amount <= 0 || participants_ids.length === 0) return;

    const share = roundToTwo(amount / participants_ids.length);
    
    const newExpense = {
        title: title,
        total_amount: amount,
        share: share, 
        payer_id: currentUserID,
        participants_ids: participants_ids,
        is_messenger: isMessenger, 
        timestamp: Date.now(),
    };
    
    const expensesRef = ref(db, 'expenses');
    push(expensesRef, newExpense)
        .then(() => {
            document.getElementById('expenseForm').reset();
            toggleMessengerMode(); 
            populateParticipants(); 
            showSuccessModal();
        })
        .catch(error => {
            alert(`حدث خطأ أثناء حفظ المصروف: ${error.message}`);
        });
}

// دوال التحكم بالـ Modals
window.hideModal = function() {
    document.getElementById('previewModal').classList.remove('show');
}
window.handleSaveClick = function() {
    saveExpense();
}
window.showSuccessModal = function() {
    document.getElementById('successModal').classList.add('show');
}
window.hideSuccessModal = function() {
    document.getElementById('successModal').classList.remove('show');
}
window.hideNotificationModal = function() {
    document.getElementById('notificationModal').classList.remove('show');
}
window.showNotifications = function() {
    document.getElementById('notificationModal').classList.add('show');
}
// دوال القائمة الجانبية (للتكامل مع index.html)
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : 'auto';
}
window.closeSidebar = function() {
    document.getElementById('sidebar').classList.remove('open');
    document.body.style.overflow = 'auto';
}


// ============================================================
// 📜 منطق سجل التاريخ (History Logic)
// ============================================================

// دالة مساعد: لتحديد تاريخ البدء حسب الفلتر
function getFilterStartDate(filter) {
    const now = new Date();
    switch (filter) {
        case '30days':
            now.setDate(now.getDate() - 30);
            return now.getTime();
        case '3months':
            now.setMonth(now.getMonth() - 3);
            return now.getTime();
        case 'all':
        case 'incoming':
        case 'outgoing':
        default:
            return 0;
    }
}

// دالة تطبيق الفلتر (المرتبطة بأزرار HTML)
window.setFilter = function(filter, element) {
    activeFilter = filter;
    
    document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    currentHistoryIndex = 0;
    displayHistory(false);
}

// دالة عرض سجلات التاريخ الموحدة والمقسمة (Pagination)
function displayHistory(isLoadMore = false) {
    const container = document.getElementById('expensesContainer');
    const loadMoreBtn = document.getElementById('loadMoreHistory');
    
    if (!container) return;
    
    if (!isLoadMore) {
        container.innerHTML = `
            <p class="text-center text-gray-400 mt-12">
                <i class="fas fa-spinner fa-spin fa-2x mb-4"></i><br>
                جاري تصفية وتحميل السجلات...
            </p>`;
    }

    // 1. دمج المصروفات والتسويات وفرزها زمنياً (الأحدث أولاً)
    const combinedHistory = [
        ...allExpenses.map(item => ({...item, type: 'expense', timestamp: item.timestamp, id: item.firebaseId })),
        ...allSettlements.map(item => ({...item, type: 'settlement', timestamp: item.timestamp, id: item.firebaseId }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    // 2. تطبيق التصفية الزمنية (التاريخ)
    const startDate = getFilterStartDate(activeFilter);
    let filteredHistory = combinedHistory.filter(item => item.timestamp >= startDate);

    // 3. تطبيق التصفية حسب النوع (وارد/صادر)
    if (activeFilter === 'incoming') {
        filteredHistory = filteredHistory.filter(item => {
            if (item.type === 'settlement') return item.recipient_id === currentUserID;
            if (item.type === 'expense') return item.payer_id === currentUserID; 
            return false;
        });
    } else if (activeFilter === 'outgoing') {
        filteredHistory = filteredHistory.filter(item => {
            if (item.type === 'settlement') return item.payer_id === currentUserID;
            if (item.type === 'expense') return item.participants_ids.includes(currentUserID) && item.payer_id !== currentUserID;
            return false;
        });
    }

    // 4. تطبيق التحميل الكسول (Pagination)
    const itemsToDisplay = filteredHistory.slice(currentHistoryIndex, currentHistoryIndex + historyDisplayLimit);
    
    if (!isLoadMore) {
        container.innerHTML = ''; 
    }

    if (filteredHistory.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-4 mt-8">لا توجد سجلات مطابقة لمعايير البحث حالياً.</p>';
        if(loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }

    itemsToDisplay.forEach(item => {
        const { date, time } = formatBankDate(item.timestamp);
        let cardHTML = '';
        
        if (item.type === 'settlement') {
            const recipientName = getUserNameById(item.recipient_id);
            const payerName = getUserNameById(item.payer_id);
            const isPayer = item.payer_id === currentUserID;

            const mainTitle = isPayer ? `تسوية دين دفعتها لـ ${recipientName}` : `تسوية دين استلمتها من ${payerName}`;
            const amountDisplay = item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const sign = isPayer ? '-' : '+';
            const amountClass = isPayer ? 'amount-neg' : 'amount-pos';
            const iconClass = isPayer ? 'fa-arrow-circle-up text-red-500' : 'fa-arrow-circle-down text-green-500';
            const bgClass = 'bg-yellow-50 border-yellow-300'; 

            cardHTML = `
                <div class="bankak-card ${bgClass}" data-id="${item.id}" data-type="settlement">
                    <div class="card-main-content">
                        <div class="details-wrapper">
                            <div class="bank-icon-container ml-3" style="border-color: #FBBF24; color: #FBBF24;">
                                <i class="fas ${iconClass}"></i>
                            </div>
                            <div class="details-text text-right">
                                <p class="transaction-title">تسوية (عملية رقم: ${item.operation_number || 'N/A'})</p>
                                <p class="transaction-sub"> ${mainTitle} </p>
                            </div>
                        </div>
                        <div class="amount-display ${amountClass}"> ${sign} ${amountDisplay} <span class="text-sm font-normal">SDG</span> </div>
                    </div>
                    <div class="card-footer-date">
                        <span><i class="far fa-calendar-alt ml-1"></i> ${date}</span>
                        <span><i class="far fa-clock ml-1"></i> ${time}</span>
                    </div>
                </div>
            `;

        } else if (item.type === 'expense') {
            const isPayer = item.payer_id === currentUserID;
            const myShare = item.participants_ids.includes(currentUserID) && !item.is_messenger ? item.share : 0;
            const participantsCount = item.participants_ids.length;

            let mainTitle, amountDisplay, sign, amountClass, iconClass;
            
            if (isPayer) {
                // أنا الدافع: عرض المبلغ الكلي للمصروف
                mainTitle = `إجمالي المصروف المدفوع: ${item.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} SDG`;
                amountDisplay = item.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 });
                sign = '+';
                amountClass = 'amount-pos';
                iconClass = 'fa-plus-circle text-green-500';
            } else if (item.participants_ids.includes(currentUserID)) {
                // أنا مدين: عرض حصتي
                const payerName = getUserNameById(item.payer_id);
                mainTitle = `دين عليك لـ ${payerName}. حصتك: ${myShare.toLocaleString(undefined, { minimumFractionDigits: 2 })} SDG`;
                amountDisplay = myShare.toLocaleString(undefined, { minimumFractionDigits: 2 });
                sign = '-';
                amountClass = 'amount-neg';
                iconClass = 'fa-minus-circle text-red-500';
            } else {
                return; 
            }

            cardHTML = `
                <div class="bankak-card" data-id="${item.id}" data-type="expense">
                    <div class="card-main-content">
                        <div class="details-wrapper">
                            <div class="bank-icon-container ml-3 ${isPayer ? 'icon-success' : 'icon-danger'}">
                                <i class="fas ${iconClass}"></i>
                            </div>
                            <div class="details-text text-right">
                                <p class="transaction-title">${item.title}</p>
                                <p class="transaction-sub"> ${mainTitle} </p>
                            </div>
                        </div>
                        <div class="amount-display ${amountClass}"> ${sign} ${amountDisplay} <span class="text-sm font-normal">SDG</span> </div>
                    </div>
                    <div class="card-footer-date">
                        <span><i class="far fa-calendar-alt ml-1"></i> ${date}</span>
                        <span><i class="far fa-clock ml-1"></i> ${time}</span>
                    </div>
                </div>
            `;
        }

        if (cardHTML) {
            container.innerHTML += cardHTML;
        }
    });

    currentHistoryIndex += itemsToDisplay.length;
    
    if (loadMoreBtn) {
        if (currentHistoryIndex < filteredHistory.length) {
            loadMoreBtn.classList.remove('hidden');
            loadMoreBtn.textContent = `عرض المزيد (${filteredHistory.length - currentHistoryIndex} سجل متبقي)`;
        } else {
            loadMoreBtn.classList.add('hidden');
        }
        loadMoreBtn.onclick = () => displayHistory(true);
    }
}


// ============================================================
// 💰 منطق ملخص التسوية (Settlement Summary Logic)
// ============================================================

function calculateNetBalances() {
    if (!currentUserID || allUsers.length === 0) return;

    netBalances = {};
    allUsers.forEach(user => {
        if (user.uid !== currentUserID) {
            netBalances[user.uid] = 0;
        }
    });

    // 1. حساب الأرصدة بناءً على المصروفات
    allExpenses.forEach(expense => {
        const payerId = expense.payer_id;
        const share = expense.share;
        const isMessenger = expense.is_messenger || false;

        // 1.1. أنت الدافع (أنت دائن للآخرين) -> الرصيد موجب
        if (payerId === currentUserID) {
            // المستحق لي من كل مشارك
            expense.participants_ids.filter(id => id !== currentUserID).forEach(participantId => {
                 if(netBalances[participantId] !== undefined) {
                    // إذا كنت مرسالاً، تحسب حصة كاملة على الآخرين. وإذا كنت مشاركاً فكذلك.
                    netBalances[participantId] = roundToTwo(netBalances[participantId] + share);
                }
            });
        }
        // 1.2. لست الدافع ولكنك مشارك (أنت مدين للآخرين) -> الرصيد سالب
        else if (expense.participants_ids.includes(currentUserID) && !isMessenger) {
            if(netBalances[payerId] !== undefined) {
                // زيادة الدين عليك لهذا الشخص بحصتك
                netBalances[payerId] = roundToTwo(netBalances[payerId] - share);
            }
        }
    });

    // 2. تطبيق تأثير التسويات على الأرصدة الصافية
    allSettlements.forEach(settlement => {
        const { payer_id, recipient_id, amount } = settlement;
        
        // حالة 1: أنت الدافع (أنت من سدد الدين)
        if (payer_id === currentUserID && netBalances[recipient_id] !== undefined) {
            netBalances[recipient_id] = roundToTwo(netBalances[recipient_id] + amount);
        } 
        
        // حالة 2: أنت المستلم (شخص سدد لك دين عليه)
        else if (recipient_id === currentUserID && netBalances[payer_id] !== undefined) {
            netBalances[payer_id] = roundToTwo(netBalances[payer_id] - amount);
        }
    });
}

function updateSummaryDisplay() {
    // هذه الدالة ستنفذ منطق عرض الأرصدة في صفحة summary.html
    // (لم يتم توفير كودها التفصيلي بعد، لكن يجب استدعاؤها هنا)
}

// ============================================================
// 🔄 تحميل البيانات (Load Data)
// ============================================================
function loadData() {
    if (!currentUserID || !db) return;

    // جلب المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            updateHomeDisplay();
            if (window.location.href.includes('index.html')) {
                populateParticipants(); 
            }
        }
    });

    // جلب المصروفات والتسويات وتحديث العرض لجميع الصفحات
    const updateAll = () => {
        calculateNetBalances();
        if (window.location.href.includes('index.html')) {
            updateBalanceDisplay();
        }
        if (window.location.href.includes('summary.html')) {
            updateSummaryDisplay();
        }
        if (window.location.href.includes('history.html')) {
            currentHistoryIndex = 0; 
            displayHistory();
        }
    }

    // جلب المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);
        } else {
            allExpenses = [];
        }
        updateAll();
    });
    
    // جلب التسويات
    onValue(ref(db, 'settlements'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allSettlements = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] }));
        } else {
            allSettlements = [];
        }
        updateAll();
    });

    // جلب الإشعارات
    // loadNotifications(); // (غير مُضمن هنا)
}

// ============================================================
// 🔐 المصادقة والبداية (Entry Point)
// ============================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();
    } else {
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});