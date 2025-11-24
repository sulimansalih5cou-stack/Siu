// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// 🛑 إعدادات Firebase
// **الرجاء التأكد من وضع إعدادات مشروعك الحقيقية هنا**
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
const storage = getStorage(app);

// متغيرات عامة
let allUsers = []; 
let currentUserID = null; 
let currentUserDB = null; 
let allExpenses = [];
let activeFilter = '30days'; 

// متغيرات خاصة بالتسوية
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

// ... (دوال updateHomeDisplay و populateParticipants لـ index.html تبقى كما هي)
window.hideSuccessModal = () => {
    document.getElementById('successModal').classList.remove('show');
    // لضمان عملها لصفحة السجلات
    if(document.getElementById('settleModal')) document.getElementById('settleModal').classList.remove('show');
    else if(document.getElementById('previewModal')) document.getElementById('previewModal').classList.remove('show');
};

// ============================================================
// 📜 منطق صفحة السجلات (History Logic) - تم اختصار العرض
// ============================================================

function displayHistory() {
    const container = document.getElementById('expensesContainer');
    if (!container || activeFilter === 'summary') return;
    
    // ... (منطق الفلترة وعرض البطاقات يبقى كما هو)
    
    container.innerHTML = '<p class="text-center text-gray-500 mt-10">جاري عرض السجلات...</p>'; 

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

    container.innerHTML = ''; 

    // رسم البطاقات
    filteredList.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const share = expense.share;
        let netAmount = 0;
        let isPositive = false;
        let mainTitle = "";
        let detailsText = "";
        // ... (بقية منطق عرض البطاقات هنا)
    });
}

// ============================================================
// 📊 منطق ملخص الأرصدة (Summary Logic) - مصطلحات جديدة
// ============================================================

function calculateIndividualBalances() {
    // ... (منطق حساب الأرصدة يبقى كما هو)
    const individualBalances = {};
    allUsers.forEach(user => {
        if (user.uid !== currentUserID) {
            individualBalances[user.uid] = 0;
        }
    });

    allExpenses.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const share = expense.share;
        
        expense.participants_ids.forEach(participantID => {
            if (participantID === currentUserID) return; 

            // أنت الدافع (هو داير منك)
            if (isPayer && expense.participants_ids.includes(participantID)) {
                individualBalances[participantID] = roundToTwo(individualBalances[participantID] + share);
            } 
        });

        // حالة خاصة: الدافع ليس أنت، لكن أنت مشارك (أنت داير ليه)
        if (!isPayer && expense.participants_ids.includes(currentUserID)) {
             const payerID = expense.payer_id;
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
    
    summaryContainer.innerHTML += `
        <h3 class="text-lg font-bold text-gray-700 mb-4 border-b pb-2">ملخص الأرصدة مع زملائك</h3>
    `;

    Object.keys(balances).forEach(uid => {
        const balance = balances[uid];
        const otherUserName = getUserNameById(uid);
        
        if (Math.abs(balance) < 0.01) return;
        
        hasData = true;
        
        let message = "";
        let cardClass = "";
        let iconClass = "";
        let buttonText = ""; 
        let action = ""; 

        if (balance > 0) {
            // ✅ هو داير منك (أنت تطلب منه) - تستلم
            message = `**${otherUserName} داير منك**`;
            cardClass = "border-green-500 bg-green-50";
            iconClass = "fa-arrow-left text-green-600";
            buttonText = `تسوية (استلام)`;
            action = `openSettleModal('${uid}', '${otherUserName}', 'receive', ${balance})`;
        } else {
            // ✅ أنت داير لـ (أنت مدين له) - تدفع
            message = `**أنت داير لـ ${otherUserName}**`;
            cardClass = "border-red-500 bg-red-50";
            iconClass = "fa-arrow-right text-red-600";
            buttonText = `تسوية (دفع)`;
            action = `openSettleModal('${uid}', '${otherUserName}', 'pay', ${Math.abs(balance)})`;
        }

        const formattedBalance = Math.abs(balance).toLocaleString('en-US', {minimumFractionDigits: 1});

        summaryContainer.innerHTML += `
            <div class="p-4 border-r-4 ${cardClass} rounded-lg mb-3 flex flex-col shadow-sm">
                <div class="flex justify-between items-center mb-2">
                    <div class="flex items-center">
                        <i class="fas ${iconClass} ml-3 text-lg"></i>
                        <p class="text-gray-700 font-semibold">
                            ${message} <span class="text-xl font-extrabold dir-ltr">${formattedBalance} SDG</span>
                        </p>
                    </div>
                    <span class="text-sm text-gray-500">${otherUserName}</span>
                </div>
                
                <button onclick="${action}" class="w-full mt-2 py-2 text-sm font-bold rounded-md transition-colors ${balance > 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700'}">
                    <i class="fas fa-handshake ml-1"></i> ${buttonText}
                </button>
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
// 💰 دوال التسوية (Settle Up Logic) - تحديث الأرصدة تلقائياً بعد الإدخال
// ============================================================

window.openSettleModal = function(uid, name, actionType, maxAmount) {
    settleTargetUID = uid;
    settleTargetName = name;
    settleActionType = actionType;
    settleMaxAmount = maxAmount;

    const summaryEl = document.getElementById('settleSummary');
    const inputEl = document.getElementById('settleAmountInput');
    const buttonEl = document.getElementById('confirmSettleButton');
    const warningEl = document.getElementById('amountWarning');
    const bankNameEl = document.getElementById('settleBankName');
    const settleDateEl = document.getElementById('settleDate');

    const totalStr = maxAmount.toLocaleString(undefined, { minimumFractionDigits: 1 });
    
    const currentUserName = currentUserDB.displayName || auth.currentUser.displayName;
    const payerNameInApp = (actionType === 'pay') ? currentUserName : name;
    const receiverNameInApp = (actionType === 'pay') ? name : currentUserName;

    summaryEl.innerHTML = `
        <p class="font-bold">تسوية مع: <span class="text-blue-600">${name}</span></p>
        <p>الرصيد الكلي المطلوب تسويته: <span class="font-bold dir-ltr ${actionType === 'pay' ? 'text-red-600' : 'text-green-600'}">${totalStr} SDG</span></p>
        <p class="text-sm pt-2 ${actionType === 'pay' ? 'text-red-700' : 'text-green-700'}">
            <i class="fas fa-exclamation-circle ml-1"></i> 
            هذه التسوية هي تحويل من **${payerNameInApp}** إلى **${receiverNameInApp}**
        </p>
    `;

    // تهيئة حقول الإدخال
    inputEl.value = totalStr;
    bankNameEl.value = '';
    settleDateEl.value = '';
    
    buttonEl.textContent = `تأكيد التسوية بمبلغ: ${totalStr}`;
    buttonEl.disabled = false;
    buttonEl.classList.remove('bg-green-600', 'bg-red-600', 'hover:bg-green-700', 'hover:bg-red-700');
    buttonEl.classList.add('bg-blue-600', 'hover:bg-blue-700');
    warningEl.textContent = '';
    document.getElementById('proofFile').value = '';

    document.getElementById('settleModal').classList.add('show');

    // تحديث زر التأكيد عند تغيير المبلغ
    inputEl.oninput = () => {
        formatNumber(inputEl);
        const currentAmount = parseFloat(inputEl.value.replace(/,/g, ''));
        const newTotalStr = currentAmount.toLocaleString();
        
        if (currentAmount > settleMaxAmount) {
            warningEl.textContent = `المبلغ لا يجب أن يتجاوز الرصيد المطلوب (${totalStr} SDG).`;
            buttonEl.disabled = true;
        } else if (currentAmount <= 0 || isNaN(currentAmount)) {
            warningEl.textContent = `يجب إدخال مبلغ صحيح.`;
            buttonEl.disabled = true;
        } else {
            warningEl.textContent = '';
            buttonEl.disabled = false;
        }
        buttonEl.textContent = `تأكيد التسوية بمبلغ: ${newTotalStr} SDG`;
    };
}

window.hideSettleModal = () => document.getElementById('settleModal').classList.remove('show');

window.confirmSettleUp = async function() {
    const amountStr = document.getElementById('settleAmountInput').value.replace(/,/g, '');
    const settleAmount = parseFloat(amountStr);
    const proofFile = document.getElementById('proofFile').files[0];
    const bankName = document.getElementById('settleBankName').value.trim();
    const settleDate = document.getElementById('settleDate').value.trim();
    
    const confirmButton = document.getElementById('confirmSettleButton');

    // التحقق من البيانات
    if (!settleAmount || settleAmount <= 0 || isNaN(settleAmount) || settleAmount > settleMaxAmount) {
        alert('الرجاء إدخال مبلغ صحيح للتسوية لا يتجاوز الرصيد المطلوب.');
        return;
    }
    if (!bankName || !settleDate) {
        alert('الرجاء إدخال اسم المستفيد وتاريخ التحويل كما في الإشعار.');
        return;
    }
    if (!proofFile) {
        alert('الرجاء إرفاق صورة إشعار التحويل كدليل (ضروري).');
        return;
    }
    
    confirmButton.disabled = true;
    confirmButton.textContent = 'جاري المعالجة...';

    window.hideSettleModal(); 

    try {
        // 1. رفع صورة الإشعار إلى Firebase Storage
        const filePath = `settlement_proofs/${currentUserID}_${settleTargetUID}_${Date.now()}_${proofFile.name}`;
        const proofRef = storageRef(storage, filePath);
        const snapshot = await uploadBytes(proofRef, proofFile);
        const proofURL = await getDownloadURL(snapshot.ref);

        // 2. تحديد قيمة التعديل على الأرصدة (التحديث الآلي)
        let userBalanceChange = 0;
        let targetBalanceChange = 0;
        
        if (settleActionType === 'pay') {
            // أنت تدفع له: رصيدك الكلي يزيد (يقل دينك)، رصيده الكلي ينقص (يقل دينه عليك)
            userBalanceChange = settleAmount;
            targetBalanceChange = -settleAmount;
        } else {
            // أنت تستلم منه: رصيدك الكلي ينقص (تقل مطالباتك)، رصيده الكلي يزيد (يقل دينه لك)
            userBalanceChange = -settleAmount;
            targetBalanceChange = settleAmount;
        }

        const updates = {};
        const transactionId = push(ref(db, 'settlements')).key;

        // 3. تحديث أرصدة المستخدمين الكلية
        const currentUserIndex = allUsers.findIndex(u => u.uid === currentUserID);
        const targetUserIndex = allUsers.findIndex(u => u.uid === settleTargetUID);

        const newCurrentUserBalance = roundToTwo(allUsers[currentUserIndex].balance + userBalanceChange);
        const newTargetUserBalance = roundToTwo(allUsers[targetUserIndex].balance + targetBalanceChange);

        updates[`users/${currentUserID}/balance`] = newCurrentUserBalance;
        updates[`users/${settleTargetUID}/balance`] = newTargetUserBalance;

        // 4. تسجيل معاملة التسوية مع بيانات الإشعار
        updates[`settlements/${transactionId}`] = {
            amount: settleAmount,
            payer: settleActionType === 'pay' ? currentUserID : settleTargetUID, 
            receiver: settleActionType === 'pay' ? settleTargetUID : currentUserID, 
            timestamp: Date.now(), // تاريخ التسجيل الفعلي للتسوية
            
            // بيانات الإشعار المرفقة (التي أدخلها المستخدم بناءً على الصورة)
            bank_proof: {
                transferDate: settleDate,
                beneficiaryName: bankName,
                proofURL: proofURL,
            },
            
            status: 'Completed',
            settledBy: currentUserID,
            settledWithName: settleTargetName
        };

        await update(ref(db), updates);
        
        // 5. إظهار رسالة النجاح
        document.getElementById('successModal').classList.add('show');
        
        loadData();

    } catch (e) {
        console.error("Error during settlement:", e);
        alert('حدث خطأ أثناء التسوية. الرجاء المحاولة مجدداً.');
    } finally {
        confirmButton.disabled = false;
        confirmButton.textContent = 'تأكيد التسوية';
    }
}


// ============================================================
// 🔐 المصادقة والبداية (Entry Point)
// ============================================================

function initializePage() {
    if (document.getElementById('expenseForm')) {
        // ... (منطق index.html)
    } else if (document.getElementById('expensesContainer')) {
        displayHistory();
    }
}

function loadData() {
    if (!currentUserID) return;

    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            initializePage();
        }
    });

    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);
            initializePage();
        } else {
            allExpenses = [];
            initializePage(); 
        }
    });
}

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
