import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChartType, ColumnDataType, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ChartConfigDto } from './dto/build-charts.dto';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod.mjs';
import { z } from 'zod';

type SerializableCsvValue = string | number;
type ChartDetail = {
  id: string;
  name: string;
  chartType: ChartType;
  xAxis: string;
  yAxis: string;
  data: Array<Record<string, SerializableCsvValue>>;
};

type ChatMessageResponse = {
  role: Role;
  content: string;
  createdAt: string;
};

const agentResponseSchema = z.object({ content: z.string() });

@Injectable()
export class ChartsService {
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

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
      select: {
        userId: true,
        columnsMetaData: {
          select: { columnName: true, dataType: true },
        },
      },
    });

    if (!csvUpload) {
      throw new NotFoundException(`CsvUpload ${csvUploadId} not found`);
    }

    if (csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this CSV upload');
    }

    const availableXAxises = csvUpload.columnsMetaData.map(
      ({ columnName, dataType }) => ({
        columnName,
        type: dataType,
      }),
    );

    const availableYAxises = csvUpload.columnsMetaData
      .filter(({ dataType }) => ColumnDataType.NUMBER === dataType)
      .map(({ columnName, dataType }) => ({
        columnName,
        type: dataType,
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
      select: {
        columnsMetaData: { select: { columnName: true, dataType: true } },
        csvRows: { select: { rowData: true } },
        userId: true,
      },
    });

    if (!csvUpload) {
      throw new NotFoundException(`CsvUpload ${csvUploadId} not found`);
    }

    if (csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this CSV upload');
    }

    if (chartConfig.xAxis === chartConfig.yAxis) {
      throw new BadRequestException(
        `xAxis and yAxis must be different columns, both are "${chartConfig.xAxis}"`,
      );
    }
    if (
      !csvUpload.columnsMetaData
        .map(({ columnName }) => columnName)
        .includes(chartConfig.xAxis)
    ) {
      throw new BadRequestException(
        `Column "${chartConfig.xAxis}" does not exist in the CSV. Available columns: ${csvUpload.columnsMetaData.map((col) => col.columnName).join(', ')}`,
      );
    }
    if (
      !csvUpload.columnsMetaData
        .map(({ columnName }) => columnName)
        .includes(chartConfig.yAxis)
    ) {
      throw new BadRequestException(
        `Column "${chartConfig.yAxis}" does not exist in the CSV. Available columns: ${csvUpload.columnsMetaData.map((col) => col.columnName).join(', ')}`,
      );
    }
    const yAxisColumn = csvUpload.columnsMetaData.find(
      (col) => col.columnName === chartConfig.yAxis,
    );
    const yAxisType = yAxisColumn?.dataType;
    if (yAxisType !== ColumnDataType.NUMBER) {
      throw new BadRequestException(
        `Column "${chartConfig.yAxis}" has type "${yAxisType}" — yAxis must be a number`,
      );
    }

    const openAiFileId = await this.uploadChartDataToOpenAi({
      csvRows: csvUpload.csvRows,
      xAxis: chartConfig.xAxis,
      yAxis: chartConfig.yAxis,
    });

    const savedRecord = await this.prisma.chartMetaData.create({
      data: {
        name: chartConfig.name,
        type: chartConfig.chartType,
        xAxis: chartConfig.xAxis,
        yAxis: chartConfig.yAxis,
        csvUploadId,
        openAiFileId,
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
      select: {
        charts: true,
        columnsMetaData: { select: { columnName: true, dataType: true } },
        csvRows: { select: { rowData: true } },
        userId: true,
      },
    });

    if (!csvUpload) {
      throw new NotFoundException(`CsvUpload ${csvUploadId} not found`);
    }

    if (csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this CSV upload');
    }

    if (csvUpload.charts.length === 0) {
      return [];
    }

    return csvUpload.charts.map((chart) => {
      return {
        id: chart.id,
        name: chart.name,
        chartType: chart.type,
        xAxis: chart.xAxis,
        yAxis: chart.yAxis,
        data: csvUpload.csvRows.map((row) => {
          const rowData = row.rowData as Record<string, SerializableCsvValue>;
          return {
            [chart.xAxis]: rowData[chart.xAxis],
            [chart.yAxis]: rowData[chart.yAxis],
          };
        }),
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
      select: {
        userId: true,
        columnsMetaData: { select: { columnName: true, dataType: true } },
        csvRows: { select: { rowData: true } },
      },
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

    const availableColumns = csvUpload.columnsMetaData.map(
      (col) => col.columnName,
    );

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
    const yAxisColumn = csvUpload.columnsMetaData.find(
      (col) => col.columnName === chartConfig.yAxis,
    );
    const yAxisType = yAxisColumn?.dataType;
    if (yAxisType !== ColumnDataType.NUMBER) {
      throw new BadRequestException(
        `Column "${chartConfig.yAxis}" has type "${yAxisType}" — yAxis must be a number`,
      );
    }

    const axesChanged =
      chartMetaData.xAxis !== chartConfig.xAxis ||
      chartMetaData.yAxis !== chartConfig.yAxis;

    let newOpenAiFileId: string | undefined;
    if (axesChanged) {
      newOpenAiFileId = await this.uploadChartDataToOpenAi({
        csvRows: csvUpload.csvRows,
        xAxis: chartConfig.xAxis,
        yAxis: chartConfig.yAxis,
      });
    }

    const updatedRecord = await this.prisma.chartMetaData.update({
      where: { id: chartMetaDataId },
      data: {
        name: chartConfig.name,
        type: chartConfig.chartType,
        xAxis: chartConfig.xAxis,
        yAxis: chartConfig.yAxis,
        openAiFileId: newOpenAiFileId,
      },
      select: { id: true },
    });

    if (axesChanged && chartMetaData.openAiFileId) {
      await this.deleteOpenAiFile({ fileId: chartMetaData.openAiFileId });
    }

    return { id: updatedRecord.id };
  }

  async deleteChart({
    chartMetaDataId,
    userId,
  }: {
    chartMetaDataId: string;
    userId: string;
  }): Promise<void> {
    const chart = await this.prisma.chartMetaData.findUnique({
      where: { id: chartMetaDataId },
      select: {
        openAiFileId: true,
        csvUpload: { select: { userId: true } },
      },
    });

    if (!chart) {
      throw new NotFoundException(`Chart ${chartMetaDataId} not found`);
    }

    if (chart.csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this chart');
    }

    await this.prisma.chartMetaData.delete({ where: { id: chartMetaDataId } });

    if (chart.openAiFileId) {
      await this.deleteOpenAiFile({ fileId: chart.openAiFileId });
    }
  }

  async deleteOpenAiFilesForCsvUpload({
    csvUploadId,
  }: {
    csvUploadId: string;
  }): Promise<void> {
    const charts = await this.prisma.chartMetaData.findMany({
      where: { csvUploadId, openAiFileId: { not: null } },
      select: { openAiFileId: true },
    });

    await Promise.allSettled(
      charts.map((chart) =>
        this.deleteOpenAiFile({ fileId: chart.openAiFileId as string }),
      ),
    );
  }

  private async uploadChartDataToOpenAi({
    csvRows,
    xAxis,
    yAxis,
  }: {
    csvRows: { rowData: unknown }[];
    xAxis: string;
    yAxis: string;
  }): Promise<string> {
    const dataPoints = csvRows.map((row) => {
      const rowData = row.rowData as Record<string, SerializableCsvValue>;
      return { [xAxis]: rowData[xAxis], [yAxis]: rowData[yAxis] };
    });
    const jsonBytes = Buffer.from(JSON.stringify(dataPoints));
    const jsonFile = new File([jsonBytes], 'chart_data.json', {
      type: 'application/json',
    });
    const uploadedFile = await this.openai.files.create({
      file: jsonFile,
      purpose: 'assistants',
    });
    return uploadedFile.id;
  }

  private async deleteOpenAiFile({
    fileId,
  }: {
    fileId: string;
  }): Promise<void> {
    try {
      await this.openai.files.delete(fileId);
    } catch {
      console.error(`Failed to delete OpenAI file ${fileId}`);
    }
  }

  async getChatMessages({
    chartMetaDataId,
    userId,
  }: {
    chartMetaDataId: string;
    userId: string;
  }): Promise<ChatMessageResponse[]> {
    const chart = await this.prisma.chartMetaData.findUnique({
      where: { id: chartMetaDataId },
      select: { csvUpload: { select: { userId: true } } },
    });

    if (!chart) {
      throw new NotFoundException(`Chart ${chartMetaDataId} not found`);
    }

    if (chart.csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this chart');
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: { chartMetaDataId },
      orderBy: { createdAt: 'desc' },
      select: { role: true, content: true, createdAt: true },
    });

    return messages.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }));
  }

  async sendChatMessage({
    chartMetaDataId,
    userId,
    content,
  }: {
    chartMetaDataId: string;
    userId: string;
    content: string;
  }): Promise<ChatMessageResponse> {
    const chart = await this.prisma.chartMetaData.findUnique({
      where: { id: chartMetaDataId },
      select: {
        type: true,
        xAxis: true,
        yAxis: true,
        openAiFileId: true,
        csvUpload: {
          select: { userId: true },
        },
      },
    });

    if (!chart) {
      throw new NotFoundException(`Chart ${chartMetaDataId} not found`);
    }

    if (chart.csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this chart');
    }

    if (!chart.openAiFileId) {
      throw new InternalServerErrorException(
        'Chart data file is not ready yet',
      );
    }

    const openAiFileId = chart.openAiFileId;

    const systemPrompt = [
      `You are a data analyst assistant. The user is viewing a ${chart.type} chart.`,
      `X-axis: "${chart.xAxis}", Y-axis: "${chart.yAxis}".`,
      'The chart data is provided as an attached JSON file.',
      'Answer questions about this data concisely.',
      'Always respond using valid HTML markup.',
      'Use tags like <p>, <ul>, <li>, <ol>, <strong>, <em>, <table>, <tr>, <th>, <td>, <h3>, <h4> where appropriate.',
      'Do not wrap your response in <html>, <head>, or <body> tags — return only the inner content fragment.',
      'Do not include markdown, only HTML.',
    ].join('\n');

    const history = await this.prisma.chatMessage.findMany({
      where: { chartMetaDataId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });

    const response = await this.openai.responses.create({
      model: 'gpt-4o-mini',
      text: { format: zodTextFormat(agentResponseSchema, 'agent_response') },
      input: [
        { role: 'system', content: systemPrompt },
        ...history.map(
          (message): { role: 'user' | 'assistant'; content: string } => ({
            role: message.role === Role.USER ? 'user' : 'assistant',
            content: message.content,
          }),
        ),
        {
          role: 'user',
          content: [
            { type: 'input_file', file_id: openAiFileId },
            { type: 'input_text', text: content },
          ],
        },
      ],
    });

    const parsed = agentResponseSchema.safeParse(
      JSON.parse(response.output_text),
    );
    if (!parsed.success) {
      throw new InternalServerErrorException('No response from AI agent');
    }

    const [, agentMessage] = await Promise.all([
      this.prisma.chatMessage.create({
        data: { content, role: Role.USER, chartMetaDataId },
      }),
      this.prisma.chatMessage.create({
        data: {
          content: parsed.data.content,
          role: Role.AGENT,
          chartMetaDataId,
        },
        select: { role: true, content: true, createdAt: true },
      }),
    ]);

    return {
      role: agentMessage.role,
      content: agentMessage.content,
      createdAt: agentMessage.createdAt.toISOString(),
    };
  }
}
