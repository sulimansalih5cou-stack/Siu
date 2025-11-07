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

function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US'); 
    }
}

function updateBalanceDisplay() {
    if (!currentUserDB || !currentUserName) return;

    // هذه الدالة مخصصة لصفحة index.html
    const balanceElement = document.getElementById('currentBalance');
    if (balanceElement) {
        const balanceCard = document.getElementById('currentBalanceCard');
        const userNamePlaceholder = document.getElementById('userNamePlaceholder');

        userNamePlaceholder.textContent = currentUserName;

        const balanceValue = currentUserDB.balance;
        
        const sign = balanceValue >= 0 ? '+' : '';
        const formattedBalance = sign + Math.abs(balanceValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        balanceElement.textContent = formattedBalance;

        balanceCard.classList.remove('negative');
        balanceCard.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
        if (balanceValue < 0) {
            balanceCard.classList.add('negative');
        }
    }
    
    // استدعاء دالة عرض التاريخ إذا كنا في history.html
    if (document.getElementById('expensesTableBody')) {
        displayHistory();
    }
}

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

function selectAllParticipants() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
}


// 🆕 دالة مساعدة للحصول على الاسم من UID
function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم غير معروف';
}


// 📝 4. منطق قراءة وكتابة البيانات عبر Firebase

function loadDataFromFirebase() {
    if (!currentUserID) return; 

    // الاستماع لتغييرات المستخدمين (الأرصدة)
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const usersObject = snapshot.val();
            allUsers = Object.keys(usersObject).map(uid => ({ 
                uid: uid,
                ...usersObject[uid]
            }));
            
            currentUserDB = allUsers.find(u => u.uid === currentUserID);

            populateParticipants();
            updateBalanceDisplay(); // يحدث شاشة التاريخ أيضًا
        }
    });

    // الاستماع لتغييرات المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const expensesObject = snapshot.val();
            expenses = Object.keys(expensesObject).map(key => ({ 
                firebaseId: key,
                ...expensesObject[key] 
            })).reverse(); // عرض الأحدث أولاً
        } else {
             expenses = [];
        }
    });
}


// 💡 دالة الحفظ الرئيسية (المنطق المصحح)
async function saveExpense() {
    if (!currentUserID || !currentUserDB) {
        alert("خطأ: بيانات المستخدم غير متوفرة. يرجى تسجيل الدخول مجدداً.");
        return;
    }
    
    // ... (جلب البيانات والتحقق منها) ...
    const title = document.getElementById('expenseTitle').value;
    const rawAmount = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(rawAmount); 

    if (isNaN(amount) || amount <= 0) {
         alert('يرجى إدخال مبلغ صحيح.');
         return;
    }

    const participantUIDs = Array.from(
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked')
    ).map(cb => cb.getAttribute('data-user-id'));

    participantUIDs.push(currentUserID); 

    const totalParticipants = participantUIDs.length;
    const share = amount / totalParticipants;

    const usersUpdate = {};

    allUsers.forEach(user => {
        let oldBalance = user.balance; 
        let newBalance = oldBalance;

        // 1. حساب الدافع (Payer)
        if (user.uid === currentUserID) {
            const netPaidForOthers = amount - share; 
            newBalance = parseFloat((oldBalance + netPaidForOthers).toFixed(2));
        } 
        // 2. حساب المشاركين الآخرين (Participant)
        else if (participantUIDs.includes(user.uid)) {
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
        date: new Date().toISOString().split('T')[0]
    };

    try {
        await set(ref(db, 'users'), usersUpdate);
        await push(ref(db, 'expenses'), newExpense);

        // هذه الدوال تعمل فقط في index.html
        if (document.getElementById('previewModal')) {
             hideModal();
             showSuccessModal(); 
             document.getElementById('expenseForm').reset();
             document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
        }

    } catch (error) {
        alert("فشل في حفظ البيانات إلى Firebase. تأكد من اتصالك وقواعد الأمان.");
        console.error("Firebase Save Error:", error);
    }
}


// 🆕 5. وظيفة عرض سجل العمليات (مخصصة لـ history.html)
function displayHistory() {
    if (allUsers.length === 0 || expenses.length === 0 || !currentUserDB) return;

    const tableBody = document.getElementById('expensesTableBody');
    const balanceSummary = document.getElementById('balanceSummary');
    tableBody.innerHTML = '';
    balanceSummary.innerHTML = '';

    // أ. عرض ملخص الديون
    let debtSummaryHTML = '';
    
    // تصفية المستخدمين الآخرين
    const otherUsers = allUsers.filter(u => u.uid !== currentUserID); 

    otherUsers.forEach(user => {
        const balance = user.balance;
        
        if (balance > 0.01) { // أنت مدين لهم
            debtSummaryHTML += `<p class="text-red-600 font-medium"><i class="fas fa-hand-holding-usd"></i> أنت مدين لـ **${user.displayName}** بمبلغ: ${balance.toFixed(2).toLocaleString('en-US')}</p>`;
        } else if (balance < -0.01) { // هم مدينون لك
            debtSummaryHTML += `<p class="text-green-600 font-medium"><i class="fas fa-money-check-alt"></i> **${user.displayName}** مدين لك بمبلغ: ${Math.abs(balance).toFixed(2).toLocaleString('en-US')}</p>`;
        }
    });

    if (!debtSummaryHTML) {
        debtSummaryHTML = `<p class="text-gray-500 font-medium"><i class="fas fa-check-circle"></i> لا توجد ديون معلقة حالياً! (الأرصدة صفرية)</p>`;
    }

    balanceSummary.innerHTML = debtSummaryHTML;


    // ب. إنشاء جدول المصروفات
    expenses.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);
        const totalParticipants = expense.participants_ids.length;
        const share = expense.share;
        
        let statusText = '';
        let rowClass = '';

        if (isPayer) {
            const netPaid = expense.amount - share;
            statusText = `<span class="text-green-600">دافع: +${netPaid.toFixed(2).toLocaleString('en-US')}</span>`;
            rowClass = 'payer-row';
        } else if (isParticipant) {
            statusText = `<span class="text-red-600">حصتك: -${share.toFixed(2).toLocaleString('en-US')}</span>`;
            rowClass = 'debtor-row';
        } else {
            statusText = `لم تشارك`;
        }

        const payerName = getUserNameById(expense.payer_id);
        const participantNames = expense.participants_ids
            .map(uid => getUserNameById(uid))
            .filter(name => name !== payerName || name === currentUserName) // إزالة اسم الدافع المتكرر إذا كان الدافع والمشارك هو نفسه
            .join(', ');

        const row = document.createElement('tr');
        row.className = rowClass;
        row.innerHTML = `
            <td>${expense.date}</td>
            <td>${expense.title}</td>
            <td>${payerName}</td>
            <td>${expense.amount.toLocaleString('en-US')}</td>
            <td>${statusText}</td>
            <td class="text-sm">${participantNames}</td>
        `;
        tableBody.appendChild(row);
    });

    if (expenses.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-gray-500">لا توجد مصروفات مسجلة بعد.</td></tr>`;
    }
}


// 6. مراقبة حالة المصادقة (Auth State) وتجهيز البيانات
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        currentUserName = user.displayName;
        loadDataFromFirebase();
        
        // ربط زر تسجيل الخروج
        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) {
            logoutBtn.onclick = (e) => {
                 e.preventDefault();
                 auth.signOut().then(() => {
                    window.location.href = 'auth.html'; 
                 });
            }
        }
        
    } else {
        // إعادة التوجيه إلى صفحة المصادقة إذا لم يكن هناك مستخدم مسجل الدخول
        if (window.location.pathname.indexOf('auth.html') === -1) {
            window.location.href = 'auth.html'; 
        }
    }
});

// *إتاحة الدوال للـ HTML (لصفحة index.html)*
// يتم استدعاء الدوال الخاصة بصفحة history تلقائيًا بعد تحميل البيانات في loadDataFromFirebase
window.formatNumber = formatNumber;
window.selectAllParticipants = selectAllParticipants;
window.previewExpense = previewExpense;
window.saveExpense = saveExpense;
// الدوال المتعلقة بالـ Modal
if (document.getElementById('previewModal')) {
    window.hideModal = () => document.getElementById('previewModal').classList.remove('show');
    window.showSuccessModal = () => document.getElementById('successModal').classList.add('show');
    window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');
}
