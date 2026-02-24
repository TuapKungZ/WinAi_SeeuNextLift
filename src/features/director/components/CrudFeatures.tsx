"use client";
import { useEffect, useState } from "react";
import { DirectorApiService } from "@/services/director-api.service";

type CrudColumn = {
    key: string;
    label: string;
    render?: (v: any, row: any) => any;
};

type EditField = {
    key: string;
    label: string;
    type?: "text" | "number" | "date" | "select" | "password";
    options?: string[];
    parseAs?: "text" | "number" | "date";
    multiline?: boolean;
    placeholder?: string;
    required?: boolean;
};

function formatFieldValue(value: any, type?: EditField["type"]) {
    if (value == null) return "";
    if (type === "date") {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return String(value);
}

function parseFieldValue(raw: string, type?: EditField["type"], parseAs?: EditField["parseAs"]) {
    const targetType = parseAs || type;
    if (targetType === "number") {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const n = Number(trimmed);
        return Number.isNaN(n) ? NaN : n;
    }
    if (targetType === "date") {
        const trimmed = raw.trim();
        return trimmed ? trimmed : null;
    }
    return raw;
}

function buildInitialValues(fields: EditField[], source?: any) {
    const nextValues: Record<string, string> = {};
    for (const field of fields) {
        if (source) {
            nextValues[field.key] = formatFieldValue(source[field.key], field.type);
        } else if (field.type === "select") {
            nextValues[field.key] = field.options?.[0] ?? "";
        } else {
            nextValues[field.key] = "";
        }
    }
    return nextValues;
}

function buildPayloadFromValues(fields: EditField[], values: Record<string, string>) {
    const payload: any = {};
    for (const field of fields) {
        const raw = values[field.key] ?? "";
        if (field.required && raw.trim() === "") {
            throw new Error(`กรุณากรอก ${field.label}`);
        }

        if (field.type === "password" && raw.trim() === "") {
            continue;
        }

        const parsed = parseFieldValue(raw, field.type, field.parseAs);
        if (typeof parsed === "number" && Number.isNaN(parsed)) {
            throw new Error(`ค่าของ ${field.label} ไม่ถูกต้อง`);
        }
        payload[field.key] = parsed;
    }
    return payload;
}

function EditModal({
    open,
    title,
    fields,
    values,
    saving,
    onClose,
    onChange,
    onSubmit,
    submitLabel,
}: {
    open: boolean;
    title: string;
    fields: EditField[];
    values: Record<string, string>;
    saving: boolean;
    onClose: () => void;
    onChange: (key: string, value: string) => void;
    onSubmit: () => void;
    submitLabel?: string;
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
            <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                    >
                        ×
                    </button>
                </div>
                <div className="p-5 overflow-y-auto max-h-[calc(90vh-140px)]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {fields.map((field) => (
                            <label key={field.key} className={`block ${field.multiline ? "md:col-span-2" : ""}`}>
                                <span className="text-sm font-medium text-slate-700">{field.label}</span>
                                {field.multiline ? (
                                    <textarea
                                        value={values[field.key] ?? ""}
                                        onChange={(e) => onChange(field.key, e.target.value)}
                                        placeholder={field.placeholder}
                                        required={field.required}
                                        rows={4}
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                ) : field.type === "select" ? (
                                    <select
                                        value={values[field.key] ?? ""}
                                        onChange={(e) => onChange(field.key, e.target.value)}
                                        required={field.required}
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                    >
                                        {(field.options || []).map((opt) => (
                                            <option key={`${field.key}-${opt || "empty"}`} value={opt}>
                                                {opt === "" ? "-" : opt}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "password" ? "password" : "text"}
                                        value={values[field.key] ?? ""}
                                        onChange={(e) => onChange(field.key, e.target.value)}
                                        placeholder={field.placeholder}
                                        required={field.required}
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                )}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                    >
                        ยกเลิก
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={saving}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                        {saving ? "กำลังบันทึก..." : (submitLabel || "บันทึก")}
                    </button>
                </div>
            </div>
        </div>
    );
}

function CrudFeature({
    title,
    subtitle,
    color,
    fetchFn,
    deleteFn,
    columns,
    searchLabel,
    createFn,
    createFields,
    editFn,
    editFields,
}: {
    title: string;
    subtitle: string;
    color: string;
    fetchFn: (s?: string) => Promise<any[]>;
    deleteFn: (id: number) => Promise<any>;
    columns: CrudColumn[];
    searchLabel?: string;
    createFn?: (data: any) => Promise<any>;
    createFields?: EditField[] | ((items: any[]) => EditField[]);
    editFn?: (id: number, data: any) => Promise<any>;
    editFields?: EditField[] | ((items: any[]) => EditField[]);
}) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [creatingItem, setCreatingItem] = useState(false);
    const [createValues, setCreateValues] = useState<Record<string, string>>({});
    const [savingCreate, setSavingCreate] = useState(false);
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    const [savingEdit, setSavingEdit] = useState(false);

    const resolvedCreateFields = typeof createFields === "function" ? createFields(items) : (createFields || []);
    const resolvedEditFields = typeof editFields === "function" ? editFields(items) : (editFields || []);

    const load = () => {
        setLoading(true);
        fetchFn(search || undefined)
            .then((d) => {
                setItems(d || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        load();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm("ลบรายการนี้?")) return;
        try {
            await deleteFn(id);
            load();
        } catch (e: any) {
            alert(e?.message || "ลบข้อมูลไม่สำเร็จ");
        }
    };

    const openCreateModal = () => {
        if (!resolvedCreateFields.length) return;
        setCreateValues(buildInitialValues(resolvedCreateFields));
        setCreatingItem(true);
    };

    const closeCreateModal = () => {
        if (savingCreate) return;
        setCreatingItem(false);
        setCreateValues({});
    };

    const submitCreate = async () => {
        if (!createFn || !resolvedCreateFields.length) return;

        let payload: any;
        try {
            payload = buildPayloadFromValues(resolvedCreateFields, createValues);
        } catch (e: any) {
            alert(e?.message || "ข้อมูลไม่ถูกต้อง");
            return;
        }

        setSavingCreate(true);
        try {
            await createFn(payload);
            setCreatingItem(false);
            setCreateValues({});
            load();
        } catch (e: any) {
            alert(e?.message || "เพิ่มข้อมูลไม่สำเร็จ");
        } finally {
            setSavingCreate(false);
        }
    };

    const openEditModal = (item: any) => {
        if (!resolvedEditFields.length) return;
        setEditingItem(item);
        setEditValues(buildInitialValues(resolvedEditFields, item));
    };

    const closeEditModal = () => {
        if (savingEdit) return;
        setEditingItem(null);
        setEditValues({});
    };

    const submitEdit = async () => {
        if (!editingItem || !editFn || !resolvedEditFields.length) return;

        let payload: any;
        try {
            payload = buildPayloadFromValues(resolvedEditFields, editValues);
        } catch (e: any) {
            alert(e?.message || "ข้อมูลไม่ถูกต้อง");
            return;
        }

        setSavingEdit(true);
        try {
            await editFn(editingItem.id, payload);
            setEditingItem(null);
            setEditValues({});
            load();
        } catch (e: any) {
            alert(e?.message || "บันทึกข้อมูลไม่สำเร็จ");
        } finally {
            setSavingEdit(false);
        }
    };

    const hasCreate = !!createFn && resolvedCreateFields.length > 0;
    const hasEdit = !!editFn && resolvedEditFields.length > 0;

    return (
        <div className="space-y-6">
            <section className={`bg-gradient-to-br ${color} rounded-3xl p-8 text-white shadow-lg relative overflow-hidden`}>
                <div className="absolute top-0 right-0 w-64 h-full bg-white opacity-5 transform -skew-x-12 translate-x-20"></div>
                <div className="relative z-10">
                    <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-medium mb-4">{title}</div>
                    <h1 className="text-3xl font-bold">{title}</h1>
                    <p className="text-white/70 mt-2">{subtitle} ({items.length} รายการ)</p>
                </div>
            </section>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3">
                <input
                    className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder={searchLabel || "ค้นหา..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && load()}
                />
                <button onClick={load} className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">
                    ค้นหา
                </button>
                {hasCreate && (
                    <button onClick={openCreateModal} className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap">
                        เพิ่ม
                    </button>
                )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">กำลังโหลด...</div>
                ) : items.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">ไม่พบข้อมูล</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">#</th>
                                {columns.map((c, i) => (
                                    <th key={i} className="px-4 py-3 text-left text-sm font-semibold text-slate-600">
                                        {c.label}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, i) => (
                                <tr key={item.id || i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-sm text-slate-500">{i + 1}</td>
                                    {columns.map((c, j) => (
                                        <td key={j} className="px-4 py-3 text-sm text-slate-700">
                                            {c.render ? c.render(item[c.key], item) : (item[c.key] ?? "-")}
                                        </td>
                                    ))}
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {hasEdit && (
                                                <button
                                                    onClick={() => openEditModal(item)}
                                                    className="text-xs text-amber-700 hover:text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors font-medium"
                                                >
                                                    แก้ไข
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="text-xs text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors font-medium"
                                            >
                                                ลบ
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <EditModal
                open={creatingItem && hasCreate}
                title={`เพิ่ม${title}`}
                fields={resolvedCreateFields}
                values={createValues}
                saving={savingCreate}
                onClose={closeCreateModal}
                onChange={(key, value) => setCreateValues((prev) => ({ ...prev, [key]: value }))}
                onSubmit={submitCreate}
                submitLabel="เพิ่ม"
            />

            <EditModal
                open={!!editingItem && hasEdit}
                title={`แก้ไข${title}`}
                fields={resolvedEditFields}
                values={editValues}
                saving={savingEdit}
                onClose={closeEditModal}
                onChange={(key, value) => setEditValues((prev) => ({ ...prev, [key]: value }))}
                onSubmit={submitEdit}
                submitLabel="บันทึก"
            />
        </div>
    );
}
export function TeachersFeature() {
    return (
        <CrudFeature
            title="จัดการครู"
            subtitle="ข้อมูลครูทั้งหมด"
            color="from-indigo-700 to-violet-800"
            fetchFn={(s) => DirectorApiService.getTeachers(s)}
            createFn={(data) => DirectorApiService.createTeacher(data)}
            editFn={(id, data) => DirectorApiService.updateTeacher(id, data)}
            deleteFn={(id) => DirectorApiService.deleteTeacher(id)}
            createFields={(items) => {
                const departmentOptions = Array.from(new Set(
                    (items || [])
                        .map((t: any) => (t.department ?? "").toString().trim())
                        .filter((v: string) => v.length > 0)
                )).sort((a, b) => a.localeCompare(b, "th"));

                return [
                    { key: "teacher_code", label: "Username (รหัสครู)", required: true },
                    { key: "password", label: "Password", type: "password", placeholder: "เว้นว่างเพื่อใช้ค่าเริ่มต้น 1234" },
                    { key: "prefix", label: "คำนำหน้า", type: "select", options: ["", "นาย", "นาง", "นางสาว"] },
                    { key: "first_name", label: "ชื่อ" },
                    { key: "last_name", label: "นามสกุล" },
                    { key: "department", label: "กลุ่มสาระ", type: "select", options: ["", ...departmentOptions] },
                    { key: "position", label: "ตำแหน่ง" },
                    { key: "phone", label: "โทร" },
                    { key: "status", label: "สถานะ", type: "select", options: ["", "ปกติ", "เกษียน"] },
                ];
            }}
            editFields={(items) => {
                const departmentOptions = Array.from(new Set(
                    (items || [])
                        .map((t: any) => (t.department ?? "").toString().trim())
                        .filter((v: string) => v.length > 0)
                )).sort((a, b) => a.localeCompare(b, "th"));

                return [
                    { key: "teacher_code", label: "Username (รหัสครู)", required: true },
                    { key: "password", label: "Password", type: "password", placeholder: "เว้นว่างถ้าไม่เปลี่ยนรหัสผ่าน" },
                    { key: "prefix", label: "คำนำหน้า", type: "select", options: ["", "นาย", "นาง", "นางสาว"] },
                    { key: "first_name", label: "ชื่อ" },
                    { key: "last_name", label: "นามสกุล" },
                    { key: "department", label: "กลุ่มสาระ", type: "select", options: ["", ...departmentOptions] },
                    { key: "position", label: "ตำแหน่ง" },
                    { key: "phone", label: "โทร" },
                    { key: "status", label: "สถานะ", type: "select", options: ["", "ปกติ", "เกษียน"] },
                ];
            }}
            columns={[
                { key: "teacher_code", label: "รหัสครู" },
                { key: "first_name", label: "ชื่อ", render: (_, r) => `${r.prefix || ""}${r.first_name || ""} ${r.last_name || ""}` },
                { key: "department", label: "กลุ่มสาระ" },
                { key: "position", label: "ตำแหน่ง" },
                { key: "phone", label: "โทร" },
                { key: "status", label: "สถานะ" },
            ]}
        />
    );
}

export function StudentsFeature() {
    return (
        <CrudFeature
            title="ข้อมูลนักเรียน"
            subtitle="จัดการข้อมูลนักเรียนทั้งหมด"
            color="from-blue-600 to-indigo-700"
            fetchFn={(s) => DirectorApiService.getStudents({ search: s })}
            createFn={(data) => DirectorApiService.createStudent(data)}
            editFn={(id, data) => DirectorApiService.updateStudent(id, data)}
            deleteFn={(id) => DirectorApiService.deleteStudent(id)}
            createFields={(items) => {
                const uniqueValues = (key: string) =>
                    Array.from(new Set(
                        (items || [])
                            .map((x: any) => (x[key] ?? "").toString().trim())
                            .filter((v: string) => v.length > 0)
                    )).sort((a, b) => a.localeCompare(b, "th"));

                const classLevelOptions = uniqueValues("class_level");
                const roomOptions = uniqueValues("room");
                const genderOptions = uniqueValues("gender");
                const statusOptions = uniqueValues("status");
                const prefixFromData = uniqueValues("prefix");
                const prefixOptions = Array.from(new Set([
                    "",
                    ...prefixFromData,
                    "เด็กชาย",
                    "เด็กหญิง",
                    "นาย",
                    "นางสาว",
                ]));

                return [
                    { key: "student_code", label: "Username (รหัสนักเรียน)", required: true },
                    { key: "password", label: "Password", type: "password", placeholder: "เว้นว่างเพื่อใช้ค่าเริ่มต้น 1234" },
                    { key: "prefix", label: "คำนำหน้า", type: "select", options: prefixOptions },
                    { key: "first_name", label: "ชื่อ" },
                    { key: "last_name", label: "นามสกุล" },
                    { key: "class_level", label: "ชั้น", type: "select", options: ["", ...classLevelOptions] },
                    { key: "room", label: "ห้อง", type: "select", options: ["", ...roomOptions] },
                    { key: "gender", label: "เพศ", type: "select", options: ["", ...(genderOptions.length ? genderOptions : ["ชาย", "หญิง"])] },
                    { key: "status", label: "สถานะ", type: "select", options: ["", ...statusOptions] },
                    { key: "phone", label: "โทร" },
                ];
            }}
            editFields={(items) => {
                const uniqueValues = (key: string) =>
                    Array.from(new Set(
                        (items || [])
                            .map((x: any) => (x[key] ?? "").toString().trim())
                            .filter((v: string) => v.length > 0)
                    )).sort((a, b) => a.localeCompare(b, "th"));

                const classLevelOptions = uniqueValues("class_level");
                const roomOptions = uniqueValues("room");
                const genderOptions = uniqueValues("gender");
                const statusOptions = uniqueValues("status");
                const prefixFromData = uniqueValues("prefix");
                const prefixOptions = Array.from(new Set([
                    "",
                    ...prefixFromData,
                    "เด็กชาย",
                    "เด็กหญิง",
                    "นาย",
                    "นางสาว",
                ]));

                return [
                    { key: "student_code", label: "Username (รหัสนักเรียน)", required: true },
                    { key: "password", label: "Password", type: "password", placeholder: "เว้นว่างถ้าไม่เปลี่ยนรหัสผ่าน" },
                    { key: "prefix", label: "คำนำหน้า", type: "select", options: prefixOptions },
                    { key: "first_name", label: "ชื่อ" },
                    { key: "last_name", label: "นามสกุล" },
                    { key: "class_level", label: "ชั้น", type: "select", options: ["", ...classLevelOptions] },
                    { key: "room", label: "ห้อง", type: "select", options: ["", ...roomOptions] },
                    { key: "gender", label: "เพศ", type: "select", options: ["", ...(genderOptions.length ? genderOptions : ["ชาย", "หญิง"])] },
                    { key: "status", label: "สถานะ", type: "select", options: ["", ...statusOptions] },
                    { key: "phone", label: "โทร" },
                ];
            }}
            columns={[
                { key: "student_code", label: "รหัส" },
                { key: "first_name", label: "ชื่อ-สกุล", render: (_, r) => `${r.prefix || ""}${r.first_name || ""} ${r.last_name || ""}` },
                { key: "class_level", label: "ชั้น" },
                { key: "room", label: "ห้อง" },
                { key: "gender", label: "เพศ" },
                { key: "phone", label: "โทร" },
            ]}
        />
    );
}

export function SubjectsFeature() {
    return (
        <CrudFeature
            title="โครงสร้าง / รายวิชา"
            subtitle="รายวิชาทั้งหมด"
            color="from-amber-500 to-orange-600"
            fetchFn={(s) => DirectorApiService.getSubjects({ search: s })}
            createFn={(data) => DirectorApiService.createSubject(data)}
            editFn={(id, data) => DirectorApiService.updateSubject(id, data)}
            deleteFn={(id) => DirectorApiService.deleteSubject(id)}
            createFields={(items) => {
                const uniqueValues = (key: string) =>
                    Array.from(new Set(
                        (items || [])
                            .map((x: any) => (x[key] ?? "").toString().trim())
                            .filter((v: string) => v.length > 0)
                    )).sort((a, b) => a.localeCompare(b, "th"));

                const subjectTypeOptions = uniqueValues("subject_type");
                const subjectGroupOptions = uniqueValues("subject_group");
                const levelOptions = uniqueValues("level");

                return [
                    { key: "subject_code", label: "รหัสวิชา" },
                    { key: "name", label: "ชื่อวิชา", required: true },
                    { key: "credit", label: "หน่วยกิต", type: "number" },
                    { key: "subject_type", label: "ประเภท", type: "select", options: ["", ...subjectTypeOptions] },
                    { key: "subject_group", label: "กลุ่มสาระ", type: "select", options: ["", ...subjectGroupOptions] },
                    { key: "level", label: "ระดับ", type: "select", options: ["", ...levelOptions] },
                ];
            }}
            editFields={(items) => {
                const uniqueValues = (key: string) =>
                    Array.from(new Set(
                        (items || [])
                            .map((x: any) => (x[key] ?? "").toString().trim())
                            .filter((v: string) => v.length > 0)
                    )).sort((a, b) => a.localeCompare(b, "th"));

                const subjectTypeOptions = uniqueValues("subject_type");
                const subjectGroupOptions = uniqueValues("subject_group");
                const levelOptions = uniqueValues("level");

                return [
                    { key: "subject_code", label: "รหัสวิชา" },
                    { key: "name", label: "ชื่อวิชา" },
                    { key: "credit", label: "หน่วยกิต", type: "number" },
                    { key: "subject_type", label: "ประเภท", type: "select", options: ["", ...subjectTypeOptions] },
                    { key: "subject_group", label: "กลุ่มสาระ", type: "select", options: ["", ...subjectGroupOptions] },
                    { key: "level", label: "ระดับ", type: "select", options: ["", ...levelOptions] },
                ];
            }}
            columns={[
                { key: "subject_code", label: "รหัสวิชา" },
                { key: "name", label: "ชื่อวิชา" },
                { key: "credit", label: "หน่วยกิต" },
                { key: "subject_type", label: "ประเภท" },
                { key: "subject_group", label: "กลุ่มสาระ" },
                { key: "level", label: "ระดับ" },
            ]}
        />
    );
}

export function ActivitiesFeature() {
    return (
        <CrudFeature
            title="กิจกรรม"
            subtitle="กิจกรรมทั้งหมด"
            color="from-purple-600 to-pink-700"
            fetchFn={() => DirectorApiService.getActivities()}
            createFn={(data) => DirectorApiService.createActivity(data)}
            editFn={(id, data) => DirectorApiService.updateActivity(id, data)}
            deleteFn={(id) => DirectorApiService.deleteActivity(id)}
            createFields={(items) => {
                const categoryOptions = Array.from(new Set(
                    (items || [])
                        .map((x: any) => (x.category ?? "").toString().trim())
                        .filter((v: string) => v.length > 0)
                )).sort((a, b) => a.localeCompare(b, "th"));

                return [
                    { key: "name", label: "ชื่อกิจกรรม", required: true },
                    { key: "date", label: "วันที่", type: "date" },
                    { key: "location", label: "สถานที่" },
                    { key: "category", label: "หมวดหมู่", type: "select", options: ["", ...categoryOptions] },
                    { key: "note", label: "หมายเหตุ", multiline: true },
                ];
            }}
            editFields={(items) => {
                const categoryOptions = Array.from(new Set(
                    (items || [])
                        .map((x: any) => (x.category ?? "").toString().trim())
                        .filter((v: string) => v.length > 0)
                )).sort((a, b) => a.localeCompare(b, "th"));

                return [
                    { key: "name", label: "ชื่อกิจกรรม" },
                    { key: "date", label: "วันที่", type: "date" },
                    { key: "location", label: "สถานที่" },
                    { key: "category", label: "หมวดหมู่", type: "select", options: ["", ...categoryOptions] },
                    { key: "note", label: "หมายเหตุ", multiline: true },
                ];
            }}
            columns={[
                { key: "name", label: "ชื่อกิจกรรม" },
                { key: "date", label: "วันที่", render: (v) => (v ? new Date(v).toLocaleDateString("th-TH") : "-") },
                { key: "location", label: "สถานที่" },
                { key: "category", label: "หมวดหมู่" },
            ]}
        />
    );
}

export function ProjectsFeature() {
    return (
        <CrudFeature
            title="โครงการ / งบ"
            subtitle="โครงการทั้งหมด"
            color="from-teal-600 to-emerald-700"
            fetchFn={() => DirectorApiService.getProjects()}
            createFn={(data) => DirectorApiService.createProject(data)}
            editFn={(id, data) => DirectorApiService.updateProject(id, data)}
            deleteFn={(id) => DirectorApiService.deleteProject(id)}
            createFields={(items) => {
                const uniqueValues = (key: string) =>
                    Array.from(new Set(
                        (items || [])
                            .map((x: any) => (x[key] ?? "").toString().trim())
                            .filter((v: string) => v.length > 0)
                    )).sort((a, b) => a.localeCompare(b, "th"));

                const departmentOptions = uniqueValues("department");
                const semesterOptions = Array.from(new Set(
                    (items || [])
                        .map((x: any) => (x.semester == null ? "" : String(x.semester)))
                        .filter((v: string) => v.length > 0)
                )).sort((a, b) => Number(a) - Number(b));

                return [
                    { key: "name", label: "ชื่อโครงการ", required: true },
                    { key: "department", label: "แผนก", type: "select", options: ["", ...departmentOptions] },
                    { key: "year", label: "ปี", type: "number" },
                    { key: "semester", label: "ภาคเรียน", type: "select", options: ["", ...(semesterOptions.length ? semesterOptions : ["1", "2"])], parseAs: "number" },
                    { key: "objective", label: "วัตถุประสงค์", multiline: true },
                    { key: "budget_total", label: "งบประมาณรวม", type: "number" },
                    { key: "budget_used", label: "ใช้ไป", type: "number" },
                ];
            }}
            editFields={(items) => {
                const uniqueValues = (key: string) =>
                    Array.from(new Set(
                        (items || [])
                            .map((x: any) => (x[key] ?? "").toString().trim())
                            .filter((v: string) => v.length > 0)
                    )).sort((a, b) => a.localeCompare(b, "th"));

                const departmentOptions = uniqueValues("department");
                const semesterOptions = Array.from(new Set(
                    (items || [])
                        .map((x: any) => (x.semester == null ? "" : String(x.semester)))
                        .filter((v: string) => v.length > 0)
                )).sort((a, b) => Number(a) - Number(b));

                return [
                    { key: "name", label: "ชื่อโครงการ" },
                    { key: "department", label: "แผนก", type: "select", options: ["", ...departmentOptions] },
                    { key: "year", label: "ปี", type: "number" },
                    { key: "semester", label: "ภาคเรียน", type: "select", options: semesterOptions.length ? semesterOptions : ["1", "2"], parseAs: "number" },
                    { key: "objective", label: "วัตถุประสงค์", multiline: true },
                    { key: "budget_total", label: "งบประมาณรวม", type: "number" },
                    { key: "budget_used", label: "ใช้ไป", type: "number" },
                ];
            }}
            columns={[
                { key: "name", label: "ชื่อโครงการ" },
                { key: "department", label: "แผนก" },
                { key: "budget_total", label: "งบประมาณ", render: (v) => (v ? Number(v).toLocaleString("th-TH") : "0") },
                { key: "budget_used", label: "ใช้ไป", render: (v) => (v ? Number(v).toLocaleString("th-TH") : "0") },
                { key: "year", label: "ปี" },
            ]}
        />
    );
}

export function FinanceFeature() {
    return (
        <CrudFeature
            title="งบประมาณ"
            subtitle="บันทึกรายรับ-รายจ่าย"
            color="from-green-600 to-emerald-700"
            fetchFn={() => DirectorApiService.getFinanceRecords()}
            createFn={(data) => DirectorApiService.createFinanceRecord(data)}
            editFn={(id, data) => DirectorApiService.updateFinanceRecord(id, data)}
            deleteFn={(id) => DirectorApiService.deleteFinanceRecord(id)}
            createFields={(items) => {
                const typeOptions = Array.from(new Set([
                    "รายรับ",
                    "รายจ่าย",
                    "income",
                    "expense",
                    ...(items || []).map((x: any) => (x.type ?? "").toString().trim()).filter((v: string) => v.length > 0),
                ]));
                return [
                    { key: "title", label: "รายการ", required: true },
                    { key: "type", label: "ประเภท", type: "select", options: typeOptions, required: true },
                    { key: "amount", label: "จำนวนเงิน", type: "number", required: true },
                    { key: "record_date", label: "วันที่", type: "date" },
                    { key: "note", label: "หมายเหตุ", multiline: true },
                ];
            }}
            editFields={(items) => {
                const typeOptions = Array.from(new Set([
                    "รายรับ",
                    "รายจ่าย",
                    "income",
                    "expense",
                    ...(items || []).map((x: any) => (x.type ?? "").toString().trim()).filter((v: string) => v.length > 0),
                ]));
                return [
                    { key: "title", label: "รายการ" },
                    { key: "type", label: "ประเภท", type: "select", options: typeOptions },
                    { key: "amount", label: "จำนวนเงิน", type: "number" },
                    { key: "record_date", label: "วันที่", type: "date" },
                    { key: "note", label: "หมายเหตุ", multiline: true },
                ];
            }}
            columns={[
                { key: "title", label: "รายการ" },
                {
                    key: "type",
                    label: "ประเภท",
                    render: (v) => (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === "รายรับ" || v === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {v}
                        </span>
                    ),
                },
                { key: "amount", label: "จำนวนเงิน", render: (v) => (v ? `${Number(v).toLocaleString("th-TH")} ฿` : "0") },
                { key: "record_date", label: "วันที่", render: (v) => (v ? new Date(v).toLocaleDateString("th-TH") : "-") },
                { key: "note", label: "หมายเหตุ" },
            ]}
        />
    );
}

