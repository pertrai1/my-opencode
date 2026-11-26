// Porcelain v1 with -z emits the destination first and a second path for R/C.
export function parseStatusRecords(output) {
  const fields = output.split("\0");
  const records = [];
  for (let index = 0; index < fields.length - 1; index++) {
    const field = fields[index];
    const status = field.slice(0, 2);
    const path = field.slice(3);
    const originalPath = /[RC]/.test(status) ? fields[++index] : undefined;
    records.push({ status, path, originalPath });
  }
  return records;
}
