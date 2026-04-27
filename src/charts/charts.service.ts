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

type ChartDataPoint = {
  id: string;
  name: string;
  chartType: ChartType;
  xAxis: string;
  yAxis: string;
  data: {
    xValues: SerializableCsvValue[];
    yValues: SerializableCsvValue[];
  };
};

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

  async buildCharts({
    csvUploadId,
    userId,
    charts,
  }: {
    csvUploadId: string;
    userId: string;
    charts: ChartConfigDto[];
  }): Promise<ChartDataPoint[]> {
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

    for (const chartConfig of charts) {
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
      const yAxisType = storedData[chartConfig.yAxis].type;
      if (
        yAxisType !== ColumnDataType.NUMBER &&
        yAxisType !== ColumnDataType.DATE_ISO
      ) {
        throw new BadRequestException(
          `Column "${chartConfig.yAxis}" has type "${yAxisType}" — yAxis must be a number or an iso string`,
        );
      }
    }

    const savedRecords = await this.prisma.$transaction(
      charts.map((chartConfig) =>
        this.prisma.chartMetaData.create({
          data: {
            name: chartConfig.name,
            type: chartConfig.chartType,
            xAxis: chartConfig.xAxis,
            yAxis: chartConfig.yAxis,
            csvUploadId,
          },
        }),
      ),
    );

    return savedRecords.map((record) => ({
      id: record.id,
      name: record.name,
      chartType: record.type,
      xAxis: record.xAxis,
      yAxis: record.yAxis,
      data: {
        xValues: storedData[record.xAxis].values,
        yValues: storedData[record.yAxis].values,
      },
    }));
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
