import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ColumnDataType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CsvValue = string | number | Date;
type CsvColumns = Record<string, ColumnDataType>;

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
    const { headings, rows } = this.parse({ buffer });

    const csvUpload = await this.prisma.csvUpload.create({
      data: {
        fileName,
        userId,
        csvRows: {
          createMany: {
            data: rows.map((row) => ({
              rowData: row,
            })),
          },
        },
        columnsMetaData: {
          createMany: {
            data: Object.entries(headings).map(([header, type]) => ({
              columnName: header,
              dataType: type,
            })),
          },
        },
      },
    });

    return { csvUploadId: csvUpload.id };
  }
  async deleteCsvUpload({
    id,
    userId,
  }: {
    id: string;
    userId: string;
  }): Promise<void> {
    const csvUpload = await this.prisma.csvUpload.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!csvUpload) {
      throw new NotFoundException(`CsvUpload ${id} not found`);
    }

    if (csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this CSV upload');
    }

    await this.prisma.csvUpload.delete({ where: { id } });
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

  private parse({ buffer }: { buffer: Buffer }): {
    rows: Record<string, CsvValue>[];
    headings: CsvColumns;
  } {
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
    const headings: CsvColumns = Object.fromEntries(
      headers.map((header) => [header, ColumnDataType.TEXT]),
    );

    const rows: Record<string, CsvValue>[] = [];

    for (const [rowIndex, line] of lines.slice(1).entries()) {
      const values = line.split(',').map((cell) => cell.trim());
      const row = headers.reduce(
        (rowObject: Record<string, CsvValue>, header, colIndex) => {
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
            headings[header] = inferType(raw);
          }

          rowObject[header] = parseValueAs({
            raw,
            type: headings[header],
            rowIndex,
            header,
          });
          return rowObject;
        },
        {},
      );
      rows.push(row);
    }

    return { rows, headings };
  }
}
