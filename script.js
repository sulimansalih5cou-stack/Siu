// في ملف script.js

// 🔥🔥 دالة جديدة: عرض المصروفات الشخصية (الحصة الفردية) 🔥🔥
function displayPersonalExpenses() {
    const container = document.getElementById('personalExpensesContainer');
    if (!container) return; // تأكد من أنك في الصفحة الصحيحة
    
    container.innerHTML = '';
    
    const personalList = allExpenses.filter(expense => 
        expense.participants_ids.includes(currentUserID) // أنت مشارك أو دافع/مرسال
    ).sort((a, b) => b.timestamp - a.timestamp);

    if (personalList.length === 0) {
        document.getElementById('noPersonalExpenses').classList.remove('hidden');
        return;
    }
    document.getElementById('noPersonalExpenses').classList.add('hidden');

    personalList.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isMessenger = expense.is_messenger || false;
        const share = expense.share;
        
        let displayAmount;
        let mainTitle;
        let colorClass;
        let iconClass;
        
        const { date, time } = formatBankDate(expense.timestamp);

        if (isPayer && !isMessenger) {
            // الحالة 1: أنت الدافع ومشارك (مصروف منك - صادر)
            displayAmount = share;
            mainTitle = `حصتك الخاصة في مصروف: ${expense.title}`;
            colorClass = "amount-neg"; // خصم من رصيدك
            iconClass = "icon-danger";
        } else if (expense.participants_ids.includes(currentUserID) && !isPayer) {
            // الحالة 2: أنت مشارك ولست الدافع (دين عليك - صادر)
            displayAmount = share;
            const payerName = getUserNameById(expense.payer_id);
            mainTitle = `دين عليك لـ ${payerName} في مصروف: ${expense.title}`;
            colorClass = "amount-neg"; // خصم من رصيدك
            iconClass = "icon-danger";
        } else if (isPayer && isMessenger) {
            // الحالة 3: أنت مرسال (حصتك صفر، لا تظهر في هذا السجل إذا كانت حصتك هي المطلوبة)
            // بما أن حصتك صفر، يمكن تجاهل هذا المصروف في سجل المصروفات الشخصية إذا أردنا التركيز على الحصص المدفوعة فعلاً.
            // ولكن دعنا نعرضه كتذكير بالعملية.
             displayAmount = 0;
             mainTitle = `قمت بالتسديد كمرسال بالنيابة`;
             colorClass = "amount-pos"; // عملية تسديد
             iconClass = "icon-success";
        } else {
            return; // تجاهل الحالات الأخرى
        }
        
        // إذا كان المبلغ صفر (مرسال)، لا نعرضه
        if (displayAmount === 0 && isMessenger) return;

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
// يجب استدعاء هذه الدالة الجديدة في loadData