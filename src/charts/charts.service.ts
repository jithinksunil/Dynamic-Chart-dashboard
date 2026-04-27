import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChartType, ColumnDataType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ChartConfigDto } from './dto/build-charts.dto';

type SerializableCsvValue = string | number;
type SerializableCsvColumn = {
  type: string;
  values: SerializableCsvValue[];
};
type StoredCsvData = Record<string, SerializableCsvColumn>;

type ChartAxisDetail = {
  values: SerializableCsvValue[];
  dataType: ColumnDataType;
};

type ChartDetail = {
  xAxis: ChartAxisDetail;
  yAxis: ChartAxisDetail;
  name: string;
  chartType: ChartType;
};

@Injectable()
export class ChartsService {
  constructor(private readonly prisma: PrismaService) {}

  async getChartBuilderInfo({
    csvUploadId,
    userId,
  }: {
    csvUploadId: string;
    userId: string;
  }): Promise<{
    availableXAxises: { columnName: string; type: ColumnDataType }[];
    availableYAxises: { columnName: string; type: ColumnDataType }[];
  }> {
    const csvUpload = await this.prisma.csvUpload.findUnique({
      where: { id: csvUploadId },
      select: { userId: true, data: true },
    });

    if (!csvUpload) {
      throw new NotFoundException(`CsvUpload ${csvUploadId} not found`);
    }

    if (csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this CSV upload');
    }

    const storedData = csvUpload.data as StoredCsvData;
    const xAxisTypes = new Set<string>([
      ColumnDataType.NUMBER,
      ColumnDataType.DATE_ISO,
    ]);

    const availableXAxises = Object.entries(storedData)
      .filter(([, column]) => xAxisTypes.has(column.type))
      .map(([columnName, column]) => ({
        columnName,
        type: column.type as ColumnDataType,
      }));

    const availableYAxises = Object.entries(storedData).map(
      ([columnName, column]) => ({
        columnName,
        type: column.type as ColumnDataType,
      }),
    );

    return { availableXAxises, availableYAxises };
  }

  async buildCharts({
    csvUploadId,
    userId,
    chart,
  }: {
    csvUploadId: string;
    userId: string;
    chart: ChartConfigDto;
  }): Promise<{ id: string }> {
    const csvUpload = await this.prisma.csvUpload.findUnique({
      where: { id: csvUploadId },
    });

    if (!csvUpload) {
      throw new NotFoundException(`CsvUpload ${csvUploadId} not found`);
    }

    if (csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this CSV upload');
    }

    const storedData = csvUpload.data as StoredCsvData;
    const availableColumns = Object.keys(storedData);
    const chartConfig = chart;

    if (chartConfig.xAxis === chartConfig.yAxis) {
      throw new BadRequestException(
        `xAxis and yAxis must be different columns, both are "${chartConfig.xAxis}"`,
      );
    }
    if (!availableColumns.includes(chartConfig.xAxis)) {
      throw new BadRequestException(
        `Column "${chartConfig.xAxis}" does not exist in the CSV. Available columns: ${availableColumns.join(', ')}`,
      );
    }
    if (!availableColumns.includes(chartConfig.yAxis)) {
      throw new BadRequestException(
        `Column "${chartConfig.yAxis}" does not exist in the CSV. Available columns: ${availableColumns.join(', ')}`,
      );
    }
    const xAxisType = storedData[chartConfig.xAxis].type;
    if (
      xAxisType !== ColumnDataType.NUMBER &&
      xAxisType !== ColumnDataType.DATE_ISO
    ) {
      throw new BadRequestException(
        `Column "${chartConfig.xAxis}" has type "${xAxisType}" — xAxis must be a number or an iso string`,
      );
    }

    const savedRecord = await this.prisma.chartMetaData.create({
      data: {
        name: chartConfig.name,
        type: chartConfig.chartType,
        xAxis: chartConfig.xAxis,
        yAxis: chartConfig.yAxis,
        csvUploadId,
      },
      select: { id: true },
    });

    return { id: savedRecord.id };
  }

  async getCharts({
    csvUploadId,
    userId,
  }: {
    csvUploadId: string;
    userId: string;
  }): Promise<ChartDetail[]> {
    const csvUpload = await this.prisma.csvUpload.findUnique({
      where: { id: csvUploadId },
      include: { charts: true },
    });

    if (!csvUpload) {
      throw new NotFoundException(`CsvUpload ${csvUploadId} not found`);
    }

    if (csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this CSV upload');
    }

    const storedData = csvUpload.data as StoredCsvData;
    if (csvUpload.charts.length === 0) {
      return [];
    }

    return csvUpload.charts.map((chart) => ({
      name: chart.name,
      chartType: chart.type,
      xAxis: {
        values: storedData[chart.xAxis].values,
        dataType: storedData[chart.xAxis].type as ColumnDataType,
      },
      yAxis: {
        values: storedData[chart.yAxis].values,
        dataType: storedData[chart.yAxis].type as ColumnDataType,
      },
    }));
  }
}
