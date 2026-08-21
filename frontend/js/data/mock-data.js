/**
 * mock-data.js
 * Mock data for all dashboard components.
 * Replace with real API calls when backend is ready.
 */

window.MOCK_DATA = {

  /* ── KPI ─────────────────────────────────── */
  kpi: {
    successRate:   { value: '88%', period: 'This Month', delta: '+2% from last month', deltaColor: '#5A861F' },
    finished:      { value: '12',  period: 'Projects',   delta: '+3 from last month',  deltaColor: '#5A861F' },
    ongoing:       { value: '6',   period: 'Active',     delta: 'In progress',         deltaColor: '#768779' },
    discontinued:  { value: '3',   period: 'Cancelled',  delta: '-1 this month',       deltaColor: '#EF4444' },
  },

  /* ── Gantt Chart ─────────────────────────── */
  gantt: {
    weeks: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
    tasks: [
      { label: 'Requirement',    start: 0, duration: 2, progress: 100 },
      { label: 'UI/UX Design',   start: 1, duration: 3, progress: 80  },
      { label: 'Backend Dev',    start: 2, duration: 4, progress: 65  },
      { label: 'Frontend Dev',   start: 3, duration: 4, progress: 40  },
      { label: 'Integration',    start: 5, duration: 2, progress: 20  },
      { label: 'UAT & Testing',  start: 6, duration: 2, progress: 0   },
    ],
  },

  /* ── Incoming Reports ────────────────────── */
  reports: [
    {
      id: 'r1',
      sender: 'Rina Sari',
      title: 'Project Manager · Divisi IT',
      subject: 'Update Progress — Sprint 12 Project Alpha',
      preview: 'Tim telah menyelesaikan 85% task Sprint 12...',
      message: 'Tim telah menyelesaikan 85% task Sprint 12. Sisa task mencakup integrasi API payment gateway dan UAT final. Estimasi selesai tanggal 22 Agustus 2026. Mohon konfirmasi jadwal review dengan klien.',
      timestamp: '19 Aug 2026, 10:30',
      dotColor: '#66D575',
      unread: true,
    },
    {
      id: 'r2',
      sender: 'Budi Santoso',
      title: 'Finance Controller',
      subject: 'Budget Report — Project Alpha Q3',
      preview: 'Laporan anggaran Q3 sudah tersedia untuk review...',
      message: 'Laporan anggaran Q3 sudah tersedia untuk review. Total pengeluaran saat ini berada di 72% dari anggaran yang disetujui. Harap review sebelum akhir minggu ini.',
      timestamp: '19 Aug 2026, 09:15',
      dotColor: '#F59E0B',
      unread: true,
    },
    {
      id: 'r3',
      sender: 'Dewi Kurnia',
      title: 'CRM Lead',
      subject: 'New Lead — PT. Maju Bersama',
      preview: 'Ada lead baru yang masuk dari PT. Maju Bersama...',
      message: 'Ada lead baru yang masuk dari PT. Maju Bersama dengan estimasi nilai kontrak Rp 450 juta. Mohon konfirmasi tim sales untuk follow-up.',
      timestamp: '18 Aug 2026, 16:45',
      dotColor: '#CACACA',
      unread: false,
    },
  ],

  /* ── Notifications ───────────────────────── */
  notifications: [
    { id: 'n1', label: 'Sprint 12 deadline besok',     time: '5 menit lalu'  },
    { id: 'n2', label: 'Budget Q3 perlu persetujuan',  time: '30 menit lalu' },
    { id: 'n3', label: 'Meeting review — 14:00',       time: '1 jam lalu'    },
  ],

  /* ── Activities ──────────────────────────── */
  activities: [
    { id: 'a1', label: 'Rina menyelesaikan task UI',  time: '09:15' },
    { id: 'a2', label: 'Budi upload budget report',   time: '08:50' },
    { id: 'a3', label: 'Dewi menambah lead baru',     time: '08:20' },
  ],

  /* ── Contacts ────────────────────────────── */
  contacts: [
    { id: 'c1', name: 'Rina Sari',    initials: 'RS', color: '#F0FEE0' },
    { id: 'c2', name: 'Budi Santoso', initials: 'BS', color: '#E8F5E9' },
    { id: 'c3', name: 'Dewi Kurnia',  initials: 'DK', color: '#F3E5F5' },
    { id: 'c4', name: 'Ahmad Rizki',  initials: 'AR', color: '#E3F2FD' },
  ],
};
