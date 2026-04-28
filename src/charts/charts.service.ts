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
type SerializableCsvColumn = {
  type: string;
  values: SerializableCsvValue[];
};
type StoredCsvData = Record<string, SerializableCsvColumn>;

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
        id: chart.id,
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
        csvUpload: { select: { userId: true, data: true } },
      },
    });

    if (!chart) {
      throw new NotFoundException(`Chart ${chartMetaDataId} not found`);
    }

    if (chart.csvUpload.userId !== userId) {
      throw new ForbiddenException('You do not have access to this chart');
    }

    const rawOpenAiFileId: string | null = chart.openAiFileId;
    const openAiFileId: string = await (async (): Promise<string> => {
      if (rawOpenAiFileId) return rawOpenAiFileId;

      const storedData = chart.csvUpload.data as StoredCsvData;
      const xValues = storedData[chart.xAxis]?.values ?? [];
      const yValues = storedData[chart.yAxis]?.values ?? [];
      const chartDataPoints = xValues.map((xValue, xIndex) => ({
        [chart.xAxis]: xValue,
        [chart.yAxis]: yValues[xIndex],
      }));

      const jsonBytes = Buffer.from(JSON.stringify(chartDataPoints));
      const jsonFile = new File([jsonBytes], 'chart_data.json', {
        type: 'application/json',
      });
      const uploadedFile = await this.openai.files.create({
        file: jsonFile,
        purpose: 'assistants',
      });

      await this.prisma.chartMetaData.update({
        where: { id: chartMetaDataId },
        data: { openAiFileId: uploadedFile.id },
      });

      return uploadedFile.id;
    })();

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

    const [, agentMessage] = await this.prisma.$transaction([
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
