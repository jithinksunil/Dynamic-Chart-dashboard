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

type ChartDetail = {
  name: string;
  chartType: ChartType;
  xAxis: string;
  yAxis: string;
  data: Array<Record<string, SerializableCsvValue>>;
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

    const availableXAxises = Object.entries(storedData).map(
      ([columnName, column]) => ({
        columnName,
        type: column.type as ColumnDataType,
      }),
    );

    const availableYAxises = Object.entries(storedData)
      .filter(([, column]) => ColumnDataType.NUMBER === column.type)
      .map(([columnName, column]) => ({
        columnName,
        type: column.type as ColumnDataType,
      }));

    return { availableXAxises, availableYAxises };
  }

  async buildCharts({
    csvUploadId,
    userId,
    chartConfig,
  }: {
    csvUploadId: string;
    userId: string;
    chartConfig: ChartConfigDto;
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
    if (yAxisType !== ColumnDataType.NUMBER) {
      throw new BadRequestException(
        `Column "${chartConfig.yAxis}" has type "${yAxisType}" — yAxis must be a number`,
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

    return csvUpload.charts.map((chart) => {
      const xAxisValues = storedData[chart.xAxis].values;
      const yAxisValues = storedData[chart.yAxis].values;

      return {
        name: chart.name,
        chartType: chart.type,
        xAxis: chart.xAxis,
        yAxis: chart.yAxis,
        data: xAxisValues.map((xValue, index) => ({
          [chart.xAxis]: xValue,
          [chart.yAxis]: yAxisValues[index],
        })),
      };
    });
  }

  async updateChartMetadata({
    csvUploadId,
    chartMetaDataId,
    userId,
    chartConfig,
  }: {
    csvUploadId: string;
    chartMetaDataId: string;
    userId: string;
    chartConfig: ChartConfigDto;
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

    const chartMetaData = await this.prisma.chartMetaData.findUnique({
      where: { id: chartMetaDataId },
    });

    if (!chartMetaData) {
      throw new NotFoundException(`ChartMetaData ${chartMetaDataId} not found`);
    }

    if (chartMetaData.csvUploadId !== csvUploadId) {
      throw new ForbiddenException(
        'ChartMetaData does not belong to this CSV upload',
      );
    }

    const storedData = csvUpload.data as StoredCsvData;
    const availableColumns = Object.keys(storedData);

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
    if (yAxisType !== ColumnDataType.NUMBER) {
      throw new BadRequestException(
        `Column "${chartConfig.yAxis}" has type "${yAxisType}" — yAxis must be a number`,
      );
    }

    const updatedRecord = await this.prisma.chartMetaData.update({
      where: { id: chartMetaDataId },
      data: {
        name: chartConfig.name,
        type: chartConfig.chartType,
        xAxis: chartConfig.xAxis,
        yAxis: chartConfig.yAxis,
      },
      select: { id: true },
    });

    return { id: updatedRecord.id };
  }
}
