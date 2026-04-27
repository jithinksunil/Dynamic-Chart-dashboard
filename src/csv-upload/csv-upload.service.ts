import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ColumnDataType = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  DATE_ISO: 'DATE_ISO',
} as const;
type ColumnDataType = (typeof ColumnDataType)[keyof typeof ColumnDataType];

type CsvValue = string | number | Date;
type CsvColumn = { type: ColumnDataType; values: CsvValue[] };
type CsvColumns = Record<string, CsvColumn>;

type SerializableCsvValue = string | number;
type SerializableCsvColumn = {
  type: ColumnDataType;
  values: SerializableCsvValue[];
};
type SerializableCsvColumns = Record<string, SerializableCsvColumn>;

// ISO 8601: date-only or datetime with optional time, offset, or Z
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

function inferType(raw: string): ColumnDataType {
  if (!isNaN(Number(raw))) return ColumnDataType.NUMBER;
  if (ISO_DATE_RE.test(raw) && !isNaN(new Date(raw).getTime()))
    return ColumnDataType.DATE_ISO;
  return ColumnDataType.TEXT;
}

function parseValueAs({
  raw,
  type,
  rowIndex,
  header,
}: {
  raw: string;
  type: ColumnDataType;
  rowIndex: number;
  header: string;
}): CsvValue {
  if (type === ColumnDataType.NUMBER) {
    const num = Number(raw);
    if (isNaN(num)) {
      throw new BadRequestException(
        `Row ${rowIndex + 1}, column "${header}" expected a number but got "${raw}"`,
      );
    }
    return num;
  }

  if (type === ColumnDataType.DATE_ISO) {
    if (!ISO_DATE_RE.test(raw)) {
      throw new BadRequestException(
        `Row ${rowIndex + 1}, column "${header}" expected an ISO date but got "${raw}"`,
      );
    }
    const parsedDate = new Date(raw);
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException(
        `Row ${rowIndex + 1}, column "${header}" expected a valid ISO date but got "${raw}"`,
      );
    }
    return parsedDate;
  }

  // text: always keep as string, even if the value looks like a number
  return raw;
}

function toSerializable(columns: CsvColumns): SerializableCsvColumns {
  return Object.fromEntries(
    Object.entries(columns).map(([header, column]) => [
      header,
      {
        type: column.type,
        values: column.values.map((value) =>
          value instanceof Date ? value.toISOString() : value,
        ),
      },
    ]),
  );
}

@Injectable()
export class CsvUploadService {
  constructor(private readonly prisma: PrismaService) {}

  async upload({
    buffer,
    fileName,
    userId,
  }: {
    buffer: Buffer;
    fileName: string;
    userId: string;
  }) {
    const columns = this.parse({ buffer });
    const data = toSerializable(columns);

    const csvUpload = await this.prisma.csvUpload.create({
      data: { fileName, data, userId },
    });

    return { csvUploadId: csvUpload.id };
  }

  async listUserCsvFiles({
    userId,
  }: {
    userId: string;
  }): Promise<{ id: string; fileName: string; createdAt: Date }[]> {
    return this.prisma.csvUpload.findMany({
      where: { userId },
      select: { id: true, fileName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private parse({ buffer }: { buffer: Buffer }): CsvColumns {
    const text = buffer.toString('utf-8');
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new BadRequestException(
        'CSV must contain a header row and at least one data row',
      );
    }
    const headers = lines[0].split(',').map((header) => header.trim());
    if (headers.length === 1) {
      throw new BadRequestException('CSV must contain more than one column');
    }
    const columns: CsvColumns = Object.fromEntries(
      headers.map((header) => [
        header,
        { type: ColumnDataType.TEXT, values: [] },
      ]),
    );

    for (const [rowIndex, line] of lines.slice(1).entries()) {
      const values = line.split(',').map((cell) => cell.trim());
      headers.forEach((header, colIndex) => {
        const raw = values[colIndex];
        if (raw === undefined) {
          throw new BadRequestException(
            `Row ${rowIndex + 1} has ${values.length} columns but expected ${headers.length} columns, values in columns "${headers.slice(values.length).join('", "')}" are missing`,
          );
        }
        if (raw === '') {
          throw new BadRequestException(
            `Row ${rowIndex + 1}, column "${header}" must not be empty`,
          );
        }

        if (rowIndex === 0) {
          columns[header].type = inferType(raw);
        }

        columns[header].values.push(
          parseValueAs({
            raw,
            type: columns[header].type,
            rowIndex,
            header,
          }),
        );
      });
    }

    return columns;
  }
}
