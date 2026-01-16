/**
 * كود خبير البرمجة - المحرك الموحد للأشرطة وإدارة التنبيهات (نسخة مصححة)
 */

document.addEventListener('DOMContentLoaded', function() {
    renderMainLayout();
});

function renderMainLayout() {
    // 1. كود HTML للشريط العلوي
    const navbarHTML = `
    <nav class="navbar">
        <div class="max-w-6xl mx-auto px-4 h-full">
            <div class="flex justify-between items-center h-full">
                <button onclick="toggleSidebar()" class="text-2xl text-gray-600 hover:text-blue-500 p-2 focus:outline-none">
                    <i class="fas fa-bars"></i>
                </button>
                <div class="text-2xl font-extrabold text-blue-600 absolute right-1/2 transform translate-x-1/2 hidden sm:block">
                    <i class="fas fa-home"></i> Smart Dorm
                </div>
                <div class="flex items-center">
                    <button id="notificationButton" class="relative text-gray-500 hover:text-red-500 p-2 focus:outline-none" onclick="handleNotificationClick()">
                        <i class="fas fa-bell text-2xl"></i>
                        <span id="notificationBadge" class="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full hidden">
                            0
                        </span>
                    </button>
                </div>
            </div>
        </div>
    </nav>`;

    // 2. كود HTML للشريط الجانبي + الغطاء الشفاف
    const sidebarHTML = `
    <div id="sidebar" class="sidebar">
        <div class="p-4 border-b">
            <h3 class="text-lg font-bold text-gray-800 sidebar-profile-text" id="sidebarUserName">جاري التحميل...</h3>
            <p class="text-sm text-gray-500 sidebar-profile-text" id="sidebarUserEmail">...</p>
        </div>
        <nav class="flex flex-col">
            <a href="index.html" class="sidebar-link"><i class="fas fa-plus-circle ml-2"></i> إضافة مصروف</a>
            <a href="my_expenses.html" class="sidebar-link"><i class="fas fa-file-invoice-dollar ml-2"></i> مصروفاتي</a>
            <a href="history.html" class="sidebar-link"><i class="fas fa-history ml-2"></i> السجل</a>
            <a href="summary.html" class="sidebar-link"><i class="fas fa-handshake ml-2"></i> تسوية الأرصدة</a>
            <a href="auth.html" id="logoutSidebarButton" class="sidebar-link text-red-600 hover:text-red-800 mt-4 border-t pt-4">
                <i class="fas fa-sign-out-alt ml-2"></i> خروج
            </a>
        </nav>
    </div>
    <div id="sidebarOverlay" class="sidebar-overlay" onclick="closeSidebar()"></div>`;

    // 3. الحقن في الحاويات
    const topPlaceholder = document.getElementById('top-nav-placeholder');
    const sidePlaceholder = document.getElementById('sidebar-placeholder');

    if (topPlaceholder) topPlaceholder.innerHTML = navbarHTML;
    if (sidePlaceholder) sidePlaceholder.innerHTML = sidebarHTML;

    // 4. تمييز الرابط الحالي
    const currentPath = window.location.pathname.split("/").pop() || 'index.html';
    document.querySelectorAll('.sidebar-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });

    checkNotificationStatus();
}

// دالة الجرس
window.handleNotificationClick = function() {
    const badge = document.getElementById('notificationBadge');
    if (badge) badge.classList.add('hidden');
    localStorage.setItem('notif_read_status', 'true');

    if (typeof window.showNotifications === "function") {
        window.showNotifications();
    } else {
        const modal = document.getElementById('notificationModal');
        if (modal) modal.classList.add('show');
    }
}

function checkNotificationStatus() {
    const isRead = localStorage.getItem('notif_read_status');
    const badge = document.getElementById('notificationBadge');
    if (isRead === 'true' && badge) badge.classList.add('hidden');
}

// وظائف القائمة (تم تعديلها لضمان عمل الـ Overlay)
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) {
        overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
    }
};

window.closeSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
};
