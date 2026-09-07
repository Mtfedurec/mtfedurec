import * as XLSX from "xlsx";
import JSZip from "jszip";

export type StudentImportRow = {
  full_name: string;
  admission_number: string;
  gender: string;
  date_of_birth: string;
  class_name: string;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  address: string;
  photo_file: string;
  class_id: string | null;
  status: "valid" | "duplicate" | "invalid";
  photo_status: "matched" | "missing" | "not-required";
  reasons: string[];
};

export type StudentImportPreview = {
  summary: {
    total: number;
    valid: number;
    duplicates: number;
    invalid: number;
    missingPhoto: number;
    matchedPhoto: number;
  };
  rows: StudentImportRow[];
  validRows: Array<{
    full_name: string;
    admission_number: string;
    gender: string;
    date_of_birth: string;
    class_id: string | null;
    guardian_name: string;
    guardian_email: string;
    guardian_phone: string;
    address: string;
    photo_url: string | null;
  }>;
};

const HEADER_ALIASES: Record<string, string[]> = {
  full_name: ["student name", "student_name", "full name", "name"],
  admission_number: ["student id", "student_id", "admission number", "admission_number", "id"],
  gender: ["gender"],
  date_of_birth: ["date of birth", "dob", "birth date"],
  class_name: ["class", "class name", "class_name"],
  guardian_name: ["parent name", "guardian name", "parent/guardian name", "guardian"],
  guardian_email: ["parent email", "guardian email", "email", "parent/guardian email"],
  guardian_phone: ["parent phone", "guardian phone", "phone", "parent/guardian phone"],
  address: ["address", "home address"],
  photo_file: ["passport photograph", "photo", "photo filename", "passport photo", "photograph"],
};

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findHeaderKey(row: Record<string, unknown>, target: string) {
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (key === target) {
      for (const alias of aliases) {
        if (Object.keys(row).some((header) => normalizeHeader(header) === alias)) {
          return Object.keys(row).find((header) => normalizeHeader(header) === alias) ?? null;
        }
      }
    }
  }
  return null;
}

function parseDateValue(value: unknown): string {
  if (!value && value !== 0) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  const text = normalizeText(value);
  if (!text) return "";
  const iso = new Date(text);
  if (Number.isNaN(iso.getTime())) return text;
  return iso.toISOString().slice(0, 10);
}

function validateEmail(value: string): boolean {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function classMatchName(className: string, classMap: Array<{ id: string; name: string }>) {
  const normalized = className.trim();
  if (!normalized) return null;
  return (
    classMap.find((entry) => entry.name.toLowerCase() === normalized.toLowerCase()) ??
    classMap.find((entry) => entry.name.toLowerCase().includes(normalized.toLowerCase())) ??
    null
  );
}

async function readPhotoArchive(file: File | null) {
  if (!file) return new Map<string, string>();
  const zip = await JSZip.loadAsync(file);
  const archive = new Map<string, string>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const lower = path.toLowerCase();
    if (!/\.(jpe?g|png|gif|webp|bmp)$/i.test(lower)) continue;
    const normalized = path.replace(/^.*[\\/]/, "").toLowerCase();
    archive.set(normalized, path);
    if (path.includes("photos/")) {
      archive.set(path.split("photos/")[1]?.toLowerCase() ?? normalized, path);
    }
  }
  return archive;
}

export async function downloadStudentImportTemplate() {
  const rows = [
    {
      "Student Name": "Jane Doe",
      "Student ID": "ST001",
      "Gender": "female",
      "Date of Birth": "2014-04-15",
      "Class": "JSS 2A",
      "Parent/Guardian Name": "Mary Doe",
      "Parent Email": "parent@example.com",
      "Parent Phone": "+2348000000000",
      "Address": "12 Main Street, Lagos",
      "Passport Photograph": "ST001.jpg",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Students");

  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "maydan-student-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export async function parseStudentImportFile(
  file: File,
  classMap: Array<{ id: string; name: string }>,
  existingIds: Set<string>,
  photoArchiveFile?: File | null,
): Promise<StudentImportPreview> {
  if (!file) throw new Error("Please select a spreadsheet file.");

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    throw new Error("Unsupported file type. Please upload a CSV or Excel spreadsheet.");
  }

  const fileSizeMb = file.size / (1024 * 1024);
  if (fileSizeMb > 10) {
    throw new Error("Spreadsheet is too large. Please choose a file smaller than 10MB.");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch {
    throw new Error("The spreadsheet could not be read. Please verify the file is not corrupted.");
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The spreadsheet does not contain any readable sheets.");

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("The spreadsheet sheet could not be loaded.");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const photoArchive = await readPhotoArchive(photoArchiveFile ?? null);
  const seenIds = new Map<string, number>();
  const previewRows: StudentImportRow[] = [];
  const validRows: StudentImportPreview["validRows"] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const rawRow = rows[index];
    if (!rawRow) continue;

    const hasAnyValue = Object.values(rawRow).some((value) => normalizeText(value).length > 0);
    if (!hasAnyValue) continue;

    const row: Record<string, string> = {};
    for (const [header, value] of Object.entries(rawRow)) {
      const normalized = normalizeHeader(header);
      const matchEntry = Object.entries(HEADER_ALIASES).find(([, aliases]) =>
        aliases.includes(normalized),
      );
      if (matchEntry) row[matchEntry[0]] = normalizeText(value);
    }

    const full_name = normalizeText(row.full_name || row.name);
    const admission_number = normalizeText(row.admission_number || row.student_id || row.id);
    const gender = normalizeText(row.gender).toLowerCase();
    const date_of_birth = parseDateValue(row.date_of_birth || row.dob || row.birth_date);
    const class_name = normalizeText(row.class_name || row.class);
    const guardian_name = normalizeText(row.guardian_name || row.guardian || row.parent_name);
    const guardian_email = normalizeText(row.guardian_email || row.parent_email || row.email);
    const guardian_phone = normalizeText(row.guardian_phone || row.parent_phone || row.phone);
    const address = normalizeText(row.address || row.home_address);
    const photo_file = normalizeText(row.photo_file || row.passport_photo || row.photograph);

    const reasons: string[] = [];
    let status: StudentImportRow["status"] = "valid";
    let photo_status: StudentImportRow["photo_status"] = photo_file ? "missing" : "not-required";

    if (!full_name) reasons.push("Missing Student Name");
    if (!admission_number) reasons.push("Missing Student ID");
    if (!class_name) reasons.push("Missing/invalid class");

    if (gender && !["male", "female", "other", "m", "f"].includes(gender)) {
      reasons.push("Invalid gender");
    }

    if (!date_of_birth) {
      reasons.push("Invalid date of birth");
    } else {
      const dob = new Date(date_of_birth);
      if (Number.isNaN(dob.getTime())) reasons.push("Invalid date of birth");
      else if (dob > new Date()) reasons.push("Date of birth cannot be in the future");
    }

    if (guardian_email && !validateEmail(guardian_email)) reasons.push("Invalid parent email");
    if (admission_number) {
      const lowerAdmission = admission_number.toLowerCase();
      if (seenIds.has(lowerAdmission)) {
        reasons.push("Duplicate Student ID within file");
      }
      seenIds.set(lowerAdmission, index + 1);
      if (existingIds.has(lowerAdmission)) reasons.push("Student ID already exists in database");
    }

    const classRecord = classMatchName(class_name, classMap);
    if (!classRecord) {
      reasons.push("Missing/invalid class");
    }

    if (photo_file) {
      const candidate = photo_file.toLowerCase();
      const direct = photoArchive.get(candidate) || photoArchive.get(candidate.replace(/^.*[\\/]/, ""));
      if (!direct) {
        reasons.push("Missing referenced photo");
      } else {
        photo_status = "matched";
      }
    }

    if (reasons.length > 0) status = "invalid";

    if (admission_number && existingIds.has(admission_number.toLowerCase())) {
      status = "duplicate";
      reasons.push("Student ID already exists in database");
    }

    if (status === "invalid" && reasons.some((reason) => reason.includes("Duplicate Student ID within file"))) {
      status = "duplicate";
    }

    const previewRow: StudentImportRow = {
      full_name,
      admission_number,
      gender: gender || "",
      date_of_birth,
      class_name,
      guardian_name,
      guardian_email,
      guardian_phone,
      address,
      photo_file,
      class_id: classRecord?.id ?? null,
      status,
      photo_status,
      reasons: Array.from(new Set(reasons)),
    };

    if (previewRow.status === "invalid" && previewRow.reasons.length > 0) {
      previewRows.push(previewRow);
      continue;
    }

    if (previewRow.status === "duplicate") {
      previewRows.push(previewRow);
      continue;
    }

    previewRows.push(previewRow);
    validRows.push({
      full_name,
      admission_number,
      gender: ["male", "m"].includes(gender) ? "male" : ["female", "f"].includes(gender) ? "female" : "other",
      date_of_birth,
      class_id: classRecord?.id ?? null,
      guardian_name,
      guardian_email,
      guardian_phone,
      address,
      photo_url: photo_file ? photoArchive.get(photo_file.toLowerCase()) ?? null : null,
    });
  }

  const summary = {
    total: previewRows.length,
    valid: previewRows.filter((row) => row.status === "valid").length,
    duplicates: previewRows.filter((row) => row.status === "duplicate").length,
    invalid: previewRows.filter((row) => row.status === "invalid").length,
    missingPhoto: previewRows.filter((row) => row.photo_status === "missing").length,
    matchedPhoto: previewRows.filter((row) => row.photo_status === "matched").length,
  };

  return { summary, rows: previewRows, validRows };
}
