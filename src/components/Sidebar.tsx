import Link from 'next/link';
import { getSession } from '@/lib/auth';

export default async function Sidebar() {
    const session = await getSession();
    const role = session?.role || 'guest';

    // Dynamic Navigation Links mapping based on user role
    const roleLinks = {
        director: [
            { name: 'แดชบอร์ด', href: '/director/dashboard' },
            { name: 'จัดการครู', href: '/director/teachers' },
            { name: 'หลักสูตรนักเรียน', href: '/director/curriculum' },
            { name: 'ข้อมูลนักเรียน', href: '/director/students' },
            { name: 'จำนวนนักเรียน', href: '/director/student_count' },
            { name: 'โครงสร้าง/รายวิชา', href: '/director/subjects' },
            { name: 'ครูที่ปรึกษา', href: '/director/advisors' },
            { name: 'โครงการ/งบ', href: '/director/projects' },
            { name: 'งบประมาณ', href: '/director/finance' },
            { name: 'กิจกรรม', href: '/director/activities' },
            { name: 'ผลการประเมิน', href: '/director/evaluation' },
            { name: 'ข้อมูลทุก Actor', href: '/director/actors' },
        ],
        teacher: [
            { name: 'แดชบอร์ด', href: '/teacher/dashboard' },
            { name: 'ตารางสอนรอบสัปดาห์', href: '/teacher/calendar' },
            { name: 'ตารางสอบ', href: '/teacher/exam_calendar' },
            { name: 'นักเรียนในที่ปรึกษา', href: '/teacher/students' },
            { name: 'ประวัติส่วนตัวนักเรียน', href: '/teacher/student_profile' },
            { name: 'ข้อมูลคะแนน', href: '/teacher/scores' },
            { name: 'ผลการประเมิน', href: '/teacher/advisor_evaluation' },
            { name: 'บันทึกคะแนน', href: '/teacher/score_input' },
            { name: 'ตัดเกรด', href: '/teacher/grade_cut' },
            { name: 'บันทึกน้ำหนักส่วนสูง', href: '/teacher/fitness' },
            { name: 'บันทึกเวลาเรียน', href: '/teacher/attendance' },
            { name: 'ประเมินการสอน', href: '/teacher/teaching_evaluation' },
        ],
        student: [
            { name: 'ลงทะเบียนเรียน', href: '/student/registration' },
            { name: 'ตารางเรียน', href: '/student/schedule' },
            { name: 'ข้อมูลส่วนตัว', href: '/student/profile' },
            { name: 'ผลการศึกษา', href: '/student/grades' },
            { name: 'ผลประเมินสุขภาพ', href: '/student/health' },
            { name: 'ประเมินการเรียนการสอน', href: '/student/evaluation' },
            { name: 'ผลประเมินการเรียน', href: '/student/learning_results' },
            { name: 'ประเมินที่ปรึกษา', href: '/student/advisor_evaluation' },
            { name: 'ผลคะแนนความประพฤติ', href: '/student/conduct' },
            { name: 'ปฏิทินกิจกรรม', href: '/student/activities' },
        ],
        guest: [
            { name: 'เข้าสู่ระบบ', href: '/login' },
        ]
    };

    const links = roleLinks[role as keyof typeof roleLinks] || roleLinks.guest;

    return (
        <aside className="fixed left-0 top-16 bottom-0 w-64 bg-slate-50 border-r border-slate-200 p-4 flex flex-col transition-transform duration-300">
            <nav className="space-y-2 flex-1">
                {links.map((link: { name: string, href: string }) => (
                    <Link
                        key={link.name}
                        href={link.href}
                        className="block px-4 py-3 rounded-xl text-slate-600 font-medium hover:bg-white hover:text-blue-600 hover:shadow-sm transition-all duration-200"
                    >
                        {link.name}
                    </Link>
                ))}
            </nav>

            <div className="p-4 mt-auto border-t border-slate-200 text-xs text-slate-400 text-center">
                Powered by Next.js & Prisma
            </div>
        </aside>
    );
}
