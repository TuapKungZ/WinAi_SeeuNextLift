import { prisma } from "@/lib/prisma";

const DEFAULT_ADVISOR_EVAL_TOPICS = [
    "ความรับผิดชอบ",
    "วินัยและการตรงต่อเวลา",
    "ความตั้งใจเรียน",
    "การอยู่ร่วมกับผู้อื่น",
    "การปฏิบัติตามกฎระเบียบ",
];

function nextId(maxId?: number | null) {
    return (Number(maxId || 0) || 0) + 1;
}

async function getStudentUserId(student_id: number) {
    if (!student_id) return null;
    const student = await prisma.students.findUnique({
        where: { id: student_id },
        select: { user_id: true },
    });
    return student?.user_id ?? null;
}

async function getTeacherUserId(teacher_id: number) {
    if (!teacher_id) return null;
    const teacher = await prisma.teachers.findUnique({
        where: { id: teacher_id },
        select: { user_id: true },
    });
    return teacher?.user_id ?? null;
}

async function resolveEvaluationPeriodId(year?: number, semester?: number) {
    if (!year || !semester) return null;
    const period = await prisma.evaluation_periods.findFirst({
        where: {
            semesters: {
                semester_number: semester,
                academic_years: { year_name: String(year) },
            },
        },
        select: { id: true },
        orderBy: { id: "desc" },
    });
    return period?.id ?? null;
}

async function ensureAdvisorEvaluationForm() {
    const existing = await prisma.evaluation_forms.findFirst({
        where: { type: "advisor" },
        include: { evaluation_questions: { orderBy: { id: "asc" } } },
        orderBy: { id: "asc" },
    });
    if (existing) return existing;

    return prisma.$transaction(async (tx) => {
        const existingAgain = await tx.evaluation_forms.findFirst({
            where: { type: "advisor" },
            include: { evaluation_questions: { orderBy: { id: "asc" } } },
            orderBy: { id: "asc" },
        });
        if (existingAgain) return existingAgain;

        const [formMax, questionMax] = await Promise.all([
            tx.evaluation_forms.aggregate({ _max: { id: true } }),
            tx.evaluation_questions.aggregate({ _max: { id: true } }),
        ]);

        const formId = nextId(formMax._max.id);
        let questionId = nextId(questionMax._max.id);

        return tx.evaluation_forms.create({
            data: {
                id: formId,
                name: "ผลประเมินโดยรวม (ครูที่ปรึกษา)",
                type: "advisor",
                evaluation_questions: {
                    create: DEFAULT_ADVISOR_EVAL_TOPICS.map((question_text) => ({
                        id: questionId++,
                        question_text,
                        question_type: "rating",
                    })),
                },
            },
            include: { evaluation_questions: { orderBy: { id: "asc" } } },
        });
    });
}

async function ensureStudentCanEvaluateAdvisor(student_id: number, teacher_id: number) {
    if (!student_id || !teacher_id) return false;
    const student = await prisma.students.findUnique({
        where: { id: student_id },
        select: { classroom_id: true },
    });
    if (!student?.classroom_id) return false;

    const advisor = await prisma.classroom_advisors.findFirst({
        where: {
            classroom_id: student.classroom_id,
            teacher_id,
        },
        select: { id: true },
    });

    return Boolean(advisor);
}

async function findLatestAdvisorTeacherResponse(
    formId: number,
    evaluatorUserId: number,
    teacherIds: number[],
    periodId?: number | null
) {
    if (!formId || !evaluatorUserId || !teacherIds.length) return null;

    const targetIdList = teacherIds.filter((id) => Number.isFinite(id) && id > 0);
    if (!targetIdList.length) return null;

    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; submitted_at: Date | null }>>(
        `
        SELECT er.id, er.submitted_at
        FROM public.evaluation_responses er
        WHERE er.form_id = ${Number(formId)}
          AND er.evaluator_user_id = ${Number(evaluatorUserId)}
          AND UPPER(COALESCE(er.target_type, '')) = 'TEACHER'
          AND er.target_id IN (${targetIdList.join(",")})
          ${periodId ? `AND er.period_id = ${Number(periodId)}` : ""}
        ORDER BY er.submitted_at DESC NULLS LAST, er.id DESC
        LIMIT 1
        `
    );

    return rows?.[0] ?? null;
}

export const StudentAdvisorTeacherEvaluationService = {
    async getTemplate(student_id: number, teacher_id: number, year: number, semester: number) {
        const canEvaluate = await ensureStudentCanEvaluateAdvisor(student_id, teacher_id);
        if (!canEvaluate) throw new Error("ไม่พบครูที่ปรึกษา");

        const [studentUserId, teacherUserId, form, periodId] = await Promise.all([
            getStudentUserId(student_id),
            getTeacherUserId(teacher_id),
            ensureAdvisorEvaluationForm(),
            resolveEvaluationPeriodId(year, semester),
        ]);

        if (!studentUserId) throw new Error("ไม่พบบัญชีนักเรียน");

        const topics = (form?.evaluation_questions?.length
            ? form.evaluation_questions.map((q) => ({ id: q.id, name: q.question_text || "" }))
            : DEFAULT_ADVISOR_EVAL_TOPICS.map((name, index) => ({ id: index + 1, name })))
            .filter((t) => t.name);

        const latest = await findLatestAdvisorTeacherResponse(
            Number(form.id),
            Number(studentUserId),
            [teacher_id, Number(teacherUserId || 0)],
            periodId ?? null
        );

        const answers = latest
            ? await prisma.evaluation_answers.findMany({
                where: { response_id: Number(latest.id) },
                include: { evaluation_questions: true },
                orderBy: { id: "asc" },
            })
            : [];

        const current = answers
            .map((a) => ({
                name: a.evaluation_questions?.question_text || a.answer_text || "",
                score: a.score != null ? Number(a.score) : null,
            }))
            .filter((a) => a.name && a.score != null);

        const feedback =
            answers.find((a) => a.score == null && String(a.answer_text || "").trim())?.answer_text || "";

        return {
            teacher_id,
            period_id: periodId ?? null,
            topics,
            current,
            feedback,
            submitted_at: latest?.submitted_at || null,
        };
    },

    async submit(
        student_id: number,
        teacher_id: number,
        year: number,
        semester: number,
        data: { name: string; score: number }[],
        feedback?: string
    ) {
        const canEvaluate = await ensureStudentCanEvaluateAdvisor(student_id, teacher_id);
        if (!canEvaluate) throw new Error("ไม่พบครูที่ปรึกษา");

        const [studentUserId, form, periodId] = await Promise.all([
            getStudentUserId(student_id),
            ensureAdvisorEvaluationForm(),
            resolveEvaluationPeriodId(year, semester),
        ]);
        if (!studentUserId) throw new Error("ไม่พบบัญชีนักเรียน");

        const questionByText = new Map<string, number>();
        (form.evaluation_questions || []).forEach((q) => {
            const key = String(q.question_text || "").trim().toLowerCase();
            if (key && !questionByText.has(key)) questionByText.set(key, Number(q.id));
        });

        return prisma.$transaction(async (tx) => {
            const [responseMax, answerMax] = await Promise.all([
                tx.evaluation_responses.aggregate({ _max: { id: true } }),
                tx.evaluation_answers.aggregate({ _max: { id: true } }),
            ]);

            const responseId = nextId(responseMax._max.id);
            let answerId = nextId(answerMax._max.id);

            await tx.$executeRawUnsafe(
                `
                INSERT INTO public.evaluation_responses
                    (id, form_id, evaluator_user_id, submitted_at, period_id, target_type, target_id)
                VALUES
                    (${responseId}, ${Number(form.id)}, ${Number(studentUserId)}, NOW(), ${periodId ? Number(periodId) : "NULL"}, 'TEACHER', ${Number(teacher_id)})
                `
            );

            for (const item of data || []) {
                const topicName = String(item?.name || "").trim();
                const score = Number(item?.score);
                if (!topicName) continue;

                const questionId = questionByText.get(topicName.toLowerCase()) ?? null;

                await tx.evaluation_answers.create({
                    data: {
                        id: answerId++,
                        response_id: responseId,
                        question_id: questionId,
                        answer_text: questionId ? null : topicName,
                        score: Number.isFinite(score) ? score : null,
                    },
                });
            }

            const feedbackText = String(feedback || "").trim();
            if (feedbackText) {
                await tx.evaluation_answers.create({
                    data: {
                        id: answerId++,
                        response_id: responseId,
                        question_id: null,
                        answer_text: feedbackText,
                        score: null,
                    },
                });
            }

            return { response_id: responseId };
        });
    },
};
