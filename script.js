// 🔥 1. تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";
import { getDatabase, ref, onValue, set, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 قم بتحديث هذه الإعدادات ببيانات مشروعك الحقيقية
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
const analytics = getAnalytics(app);
const db = getDatabase(app); 
const auth = getAuth(app); 

// 💾 2. هيكلة البيانات والمتغيرات الأساسية
let allUsers = []; 
let expenses = []; 
let currentUserID = null; 
let currentUserName = null; 
let currentUserDB = null; 

// ⚙️ 3. وظائف تحديث الواجهة والـ DOM والتنسيق

/**
 * دالة تنسيق الأرقام مع فاصلة الآلاف.
 * @param {HTMLInputElement} input - حقل الإدخال.
 */
function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US'); 
    }
}

/**
 * تحديث عرض رصيد المستخدم الحالي وتلوين البطاقة (الأخضر/الأحمر).
 */
function updateBalanceDisplay() {
    if (!currentUserDB || !currentUserName) return;

    const balanceElement = document.getElementById('currentBalance');
    const userNamePlaceholder = document.getElementById('userNamePlaceholder');

    if (balanceElement && userNamePlaceholder) { 
        const balanceCard = document.getElementById('currentBalanceCard');

        userNamePlaceholder.textContent = currentUserName;

        const balanceValue = currentUserDB.balance;

        const sign = balanceValue >= 0 ? '+' : '';
        const formattedBalance = sign + Math.abs(balanceValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        balanceElement.textContent = formattedBalance;

        balanceCard.classList.remove('negative');
        if (balanceValue < 0) {
            balanceCard.classList.add('negative');
        } else {
             // إزالة النمط المضمن الذي قد يعارض الكلاس
             balanceCard.style.background = '';
        }
    }

    // تحديث سجل العمليات إذا كنا في صفحة history.html
    if (document.getElementById('expensesContainer')) {
        displayHistory();
    }
}

/**
 * ملء مربعات اختيار المشاركين في نموذج المصروف.
 * يتم استثناء المستخدم الحالي (الدافع) من القائمة المعروضة.
 */
function populateParticipants() {
    const participantsContainer = document.getElementById('participantsCheckboxes');
    if (participantsContainer) {
        participantsContainer.innerHTML = '';
        
        allUsers.filter(u => u.uid !== currentUserID).forEach(user => { 
            const label = document.createElement('label');
            label.className = 'checkbox-item';
            label.innerHTML = `
                <input type="checkbox" data-user-id="${user.uid}" value="${user.displayName}">
                <span class="checkbox-icon fas fa-user ml-2"></span> ${user.displayName}
            `;
            participantsContainer.appendChild(label);
        });
    }
}

/**
 * وظيفة اختيار جميع المشاركين (باستثناء الدافع).
 */
function selectAllParticipants() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
}


/**
 * دالة مساعدة للحصول على الاسم من UID.
 * @param {string} uid - معرف المستخدم.
 * @returns {string} اسم المستخدم أو 'مستخدم غير معروف'.
 */
function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم غير معروف';
}

/**
 * دالة تحويل الطابع الزمني إلى تنسيق تاريخ ووقت مقروء.
 * @param {number} timestamp - الطابع الزمني بالمللي ثانية.
 * @returns {{date: string, time: string}} التاريخ والوقت المنسق.
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return { date: 'التاريخ غير متوفر', time: '' };
    const date = new Date(timestamp);

    const formattedDate = date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    const formattedTime = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    return { date: formattedDate, time: formattedTime };
}


// 📝 4. منطق قراءة وكتابة البيانات عبر Firebase

/**
 * تحميل البيانات من Firebase والبدء بالاستماع للتغييرات.
 */
function loadDataFromFirebase() {
    if (!currentUserID) return; 

    // 💡 الاستماع لتغييرات المستخدمين (الأرصدة)
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const usersObject = snapshot.val();
            allUsers = Object.keys(usersObject).map(uid => ({ 
                uid: uid,
                ...usersObject[uid]
            }));

            currentUserDB = allUsers.find(u => u.uid === currentUserID);

            populateParticipants();
            updateBalanceDisplay();
        }
    });

    // 💡 الاستماع لتغييرات المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const expensesObject = snapshot.val();
            expenses = Object.keys(expensesObject).map(key => ({ 
                firebaseId: key,
                ...expensesObject[key] 
            })).sort((a, b) => b.timestamp - a.timestamp); // فرز تنازلي
        } else {
             expenses = [];
        }

        // تحديث سجل العمليات بعد تحميل المصروفات
        if (document.getElementById('expensesContainer')) {
            displayHistory();
        }
    });
}


/**
 * معاينة المصروف وحسابه قبل الحفظ، وفتح الـ Modal.
 */
function previewExpense() {
    const title = document.getElementById('expenseTitle').value;
    const rawAmount = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(rawAmount); 

    if (!title || isNaN(amount) || amount <= 0) {
        alert('يرجى ملء اسم المصروف وإدخال مبلغ صحيح.');
        return;
    }

    const participantUIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => cb.getAttribute('data-user-id'));

    if (!currentUserID) { alert('خطأ في تحديد المستخدم!'); return; }

    // إضافة الدافع لحساب الحصة
    if (!participantUIDs.includes(currentUserID)) {
        participantUIDs.push(currentUserID); 
    }

    const totalParticipants = participantUIDs.length;

    if (totalParticipants === 0) {
        alert('يجب أن تكون أنت على الأقل أحد المشاركين في المصروف!');
        return;
    }

    const share = amount / totalParticipants;
    const netPaidForOthers = amount - share; 

    const participantNames = participantUIDs
        .map(uid => getUserNameById(uid))
        .join(', ');

    const previewText = `
        <ul class="list-disc pr-6 text-gray-700 space-y-2">
            <li><span class="font-bold">اسم المصروف:</span> ${title}</li>
            <li><span class="font-bold">المبلغ الكلي:</span> ${amount.toLocaleString('en-US')} SAR</li>
            <li><span class="font-bold">عدد المشاركين:</span> ${totalParticipants} (${participantNames})</li>
            <li><span class="font-bold">حصة كل شخص:</span> ${share.toFixed(2).toLocaleString('en-US')} SAR</li>
            <li><span class="font-bold text-green-700">صافي رصيدك (دين لك):</span> +${netPaidForOthers.toFixed(2).toLocaleString('en-US')} SAR</li>
        </ul>
    `;

    document.getElementById('previewText').innerHTML = previewText;

    // تحذير التكرار
    const today = new Date().toISOString().split('T')[0];
    const hasTodayExpense = expenses.some(e => e.payer_id === currentUserID && e.date === today && e.title === title);
    document.getElementById('warning').style.display = hasTodayExpense ? 'block' : 'none';

    document.getElementById('previewModal').classList.add('show');
}


/**
 * حفظ المصروف إلى Firebase وتحديث أرصدة المستخدمين.
 */
async function saveExpense() {
    // إخفاء الـ modal الخاص بالمعاينة
    if (document.getElementById('previewModal')) {
         hideModal();
    }

    if (!currentUserID || !currentUserDB) {
        alert("خطأ: بيانات المستخدم غير متوفرة. يرجى تسجيل الدخول مجدداً.");
        return;
    }

    const title = document.getElementById('expenseTitle').value;
    const rawAmount = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(rawAmount); 

    if (isNaN(amount) || amount <= 0) {
         return; 
    }

    // جمع IDs المشاركين
    const participantUIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => cb.getAttribute('data-user-id'));

    // إضافة الدافع
    if (!participantUIDs.includes(currentUserID)) {
        participantUIDs.push(currentUserID); 
    }

    const totalParticipants = participantUIDs.length;
    const share = amount / totalParticipants;

    const usersUpdate = {};

    allUsers.forEach(user => {
        let oldBalance = user.balance || 0; 
        let newBalance = oldBalance;

        if (user.uid === currentUserID) {
            // الدافع: يدفع كامل المبلغ لكن حصته تُخصم (دين له)
            const netPaidForOthers = amount - share;
            newBalance = parseFloat((oldBalance + netPaidForOthers).toFixed(2));
        } 
        else if (participantUIDs.includes(user.uid)) {
            // المشارك: يدفع حصته (دين عليه)
            newBalance = parseFloat((oldBalance - share).toFixed(2));
        }

        usersUpdate[user.uid] = {
            displayName: user.displayName, 
            balance: newBalance,
        };
    });

    const newExpense = {
        title: title,
        amount: amount,
        payer_id: currentUserID, 
        participants_ids: participantUIDs,
        share: parseFloat(share.toFixed(2)),
        date: new Date().toISOString().split('T')[0], 
        timestamp: Date.now() 
    };

    try {
        await set(ref(db, 'users'), usersUpdate);
        await push(ref(db, 'expenses'), newExpense);

        if (document.getElementById('expenseForm')) {
             showSuccessModal(); 

             document.getElementById('expenseForm').reset();
             document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
        }

    } catch (error) {
        alert("فشل في حفظ البيانات إلى Firebase. تأكد من اتصالك وقواعد الأمان.");
        console.error("Firebase Save Error:", error);
    }
}


// 5. وظيفة عرض سجل العمليات والديون (مخصصة لـ history.html)
function displayHistory() {
    if (allUsers.length === 0 || !currentUserDB) return;

    const expensesContainer = document.getElementById('expensesContainer');
    const debtToYouList = document.getElementById('debtToYouList'); 
    const debtFromYouList = document.getElementById('debtFromYouList');

    if (!expensesContainer || !debtToYouList || !debtFromYouList) return;

    expensesContainer.innerHTML = '';
    debtToYouList.innerHTML = '';
    debtFromYouList.innerHTML = '';

    const loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) loadingMessage.style.display = 'none'; 

    // أ. عرض ملخص الديون
    let hasDebtToYou = false;
    let hasDebtFromYou = false;
    const otherUsers = allUsers.filter(u => u.uid !== currentUserID); 

    otherUsers.forEach(user => {
        const balance = user.balance || 0; 
        const formattedBalance = Math.abs(balance).toFixed(2).toLocaleString('en-US');

        if (balance < -0.01) { // رصيده سالب، أي أنه مدين لك (أنت دائن)
            debtToYouList.innerHTML += `<p class="my-2"><i class="fas fa-arrow-up text-green-700 ml-1"></i> **${user.displayName}** مدين لك بمبلغ: ${formattedBalance} SAR</p>`;
            hasDebtToYou = true;
        } else if (balance > 0.01) { // رصيده موجب، أي أنت مدين له
            debtFromYouList.innerHTML += `<p class="my-2"><i class="fas fa-arrow-down text-red-700 ml-1"></i> أنت مدين لـ **${user.displayName}** بمبلغ: ${formattedBalance} SAR</p>`;
            hasDebtFromYou = true;
        }
    });

    if (!hasDebtToYou) {
        debtToYouList.innerHTML = `<p class="text-gray-500 font-normal"><i class="fas fa-check-circle"></i> لا أحد مدين لك حالياً.</p>`;
    }
    if (!hasDebtFromYou) {
        debtFromYouList.innerHTML = `<p class="text-gray-500 font-normal"><i class="fas fa-check-circle"></i> لا تدين لأحد حالياً.</p>`;
    }

    // ب. إنشاء بطاقات المصروفات
    if (expenses.length === 0) {
        expensesContainer.innerHTML = `<p class="text-center text-gray-500 col-span-full">لا توجد مصروفات مسجلة بعد.</p>`;
        return;
    }

    expenses.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);
        const share = expense.share;

        let statusText = '';
        let cardClass = 'neutral-card';
        let statusIcon = '<i class="fas fa-info-circle text-gray-500"></i>';

        if (isPayer) {
            const netPaid = expense.amount - share;
            statusText = `ربحت (دفعْتَ عنهم): +${netPaid.toFixed(2).toLocaleString('en-US')}`;
            cardClass = 'payer-card';
            statusIcon = '<i class="fas fa-arrow-up text-green-600"></i>';
        } else if (isParticipant) {
            statusText = `حصتك (عليك دين): -${share.toFixed(2).toLocaleString('en-US')}`;
            cardClass = 'debtor-card';
            statusIcon = '<i class="fas fa-arrow-down text-red-600"></i>';
        } else {
            statusText = `لم تشارك في هذه العملية`;
        }

        const { date: formattedDate, time: formattedTime } = formatTimestamp(expense.timestamp);
        const payerName = getUserNameById(expense.payer_id);
        const participantNames = expense.participants_ids
            .map(uid => getUserNameById(uid))
            .join(', ');

        const card = document.createElement('div');
        card.className = `expense-card ${cardClass}`;
        card.innerHTML = `
            <div class="mb-4 text-center">
                <p class="text-xl font-bold text-gray-800">${expense.title}</p>
                <p class="text-3xl font-extrabold my-2 ${isPayer ? 'text-green-700' : 'text-red-700'}">
                    ${expense.amount.toLocaleString('en-US')}
                    <span class="text-sm font-normal text-gray-500"> SAR</span>
                </p>
            </div>
            
            <div class="border-t border-b border-gray-300 py-3 mb-3 text-sm">
                <p class="flex justify-between items-center mb-1">
                    <span class="font-medium text-gray-600"><i class="fas fa-calendar-alt ml-1"></i> التاريخ:</span>
                    <span class="font-bold">${formattedDate}</span>
                </p>
                <p class="flex justify-between items-center">
                    <span class="font-medium text-gray-600"><i class="fas fa-clock ml-1"></i> الوقت:</span>
                    <span class="font-bold">${formattedTime}</span>
                </p>
            </div>

            <p class="mb-2"><span class="font-medium text-gray-600"><i class="fas fa-user-tag ml-1"></i> الدافع:</span> <strong>${payerName}</strong></p>
            
            <p class="mb-4"><span class="font-medium text-gray-600"><i class="fas fa-users ml-1"></i> المشاركون:</span> <span class="text-sm">${participantNames}</span></p>

            <div class="bg-white p-2 rounded-lg text-center ${isPayer ? 'text-green-700' : isParticipant ? 'text-red-700' : 'text-gray-500'} font-bold border border-current">
                ${statusIcon} ${statusText}
            </div>
        `;
        expensesContainer.appendChild(card);
    });
}


// 6. مراقبة حالة المصادقة (Auth State) وتجهيز البيانات
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        currentUserName = user.displayName;
        loadDataFromFirebase();

        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) {
            logoutBtn.onclick = (e) => {
                 e.preventDefault();
                 auth.signOut().then(() => {
                    window.location.href = 'auth.html'; 
                 }).catch(error => {
                     console.error("Logout Error:", error);
                     window.location.href = 'auth.html'; 
                 });
            }
        }

    } else {
        if (window.location.pathname.indexOf('auth.html') === -1) {
            window.location.href = 'auth.html'; 
        }
    }
});

// 7. الدوال المتعلقة بالـ Modal (متاحة عالمياً)
window.hideModal = () => document.getElementById('previewModal').classList.remove('show');
window.showSuccessModal = () => document.getElementById('successModal').classList.add('show');
window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');

// *إتاحة الدوال للـ HTML*
window.formatNumber = formatNumber;
window.selectAllParticipants = selectAllParticipants;
window.previewExpense = previewExpense;
window.saveExpense = saveExpense;
