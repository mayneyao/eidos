import { useAiConfig } from '@/apps/web-app/hooks/use-ai-config';
import { getProvider } from '@/packages/ai/helper';
import type { LanguageModel } from 'ai';
import { generateObject } from 'ai';
import { useState } from 'react';
import { z } from 'zod';

// Define the chart schema
const styleConfigSchema = z.object({
    stroke: z.string().optional(),
    fill: z.string().optional(),
    strokeWidth: z.number().optional(),
    opacity: z.number().optional(),
});

const axisConfigSchema = z.object({
    dataKey: z.string().optional(),
    label: z.string().optional(),
    type: z.enum(['number', 'category']).optional(),
    domain: z.tuple([z.union([z.string(), z.number()]), z.union([z.string(), z.number()])]).optional(),
    style: styleConfigSchema.optional(),
});

const seriesConfigSchema = z.object({
    type: z.union([
        z.enum(['line', 'bar', 'area', 'scatter', 'radar', 'pie']),
        z.string()
    ]),
    dataKey: z.string(),
    name: z.string().optional(),
    style: styleConfigSchema.optional(),
    stack: z.boolean().optional(),
    smooth: z.boolean().optional(),
});

const themeConfigSchema = z.record(z.object({
    label: z.string(),
    color: z.string(),
}));

const chartConfigSchema = z.object({
    type: z.enum([
        'line',
        'bar',
        'area',
        'pie',
        'scatter',
        'radar',
        'composed',
        'treemap',
        'radialBar',
        'funnel',
        'sankey'
    ]),
    data: z.array(z.record(z.any())),
    width: z.union([z.number(), z.string()]).optional(),
    height: z.union([z.number(), z.string()]).optional(),
    series: z.array(seriesConfigSchema),
    xAxis: axisConfigSchema.optional(),
    yAxis: axisConfigSchema.optional(),
    showGrid: z.boolean().optional(),
    showTooltip: z.boolean().optional(),
    showLegend: z.boolean().optional(),
    style: styleConfigSchema.optional(),
    themeConfig: themeConfigSchema.optional(),
});

export const generateChartConfig = async (prompt: string, config: any) => {
    const provider = getProvider(config)
    const modelId = config.modelId
    const llmodel = provider(modelId) as LanguageModel
    const res = await generateObject({
        model: llmodel,
        schema: chartConfigSchema,
        prompt: `You are a data visualization expert. Based on the user's input, generate a chart configuration. The user's input is enclosed in <user_input> tags. There are some rules:
        1. Always try to provide themeConfig with a consistent and readable color scheme.
        2. if generate pie chart, please ensure to provide xAxis.dataKey
        3. Ensure color contrast is sufficient for readability
        4. Use a maximum of 6-8 different colors to avoid visual clutter
        ---
        <user_input>
        ${prompt}
        </user_input>
        ---
        `,
    });
    return res.object
};

export const useGenerateChartConfig = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [config, setConfig] = useState<any>(null);
    const {
        getConfigByModel,
        codingModel,
    } = useAiConfig()

    const generateConfig = async (userPrompt: string, model: string = codingModel ?? "") => {
        let _config = null
        setIsLoading(true);
        try {
            _config = await generateChartConfig(userPrompt, getConfigByModel(model));
            setConfig(_config);
            return _config;
        } catch (error) {
            setError(error as Error);
        } finally {
            setIsLoading(false);
        }
        return _config
    }

    return {
        isLoading,
        error,
        config,
        generateConfig,
    }
}
