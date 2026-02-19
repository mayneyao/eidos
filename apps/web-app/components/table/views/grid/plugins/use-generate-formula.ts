import { useAiConfig } from '@/apps/web-app/hooks/use-ai-config';
import { getProvider } from '@/packages/ai/helper';
import type { LanguageModel } from 'ai';
import { generateObject } from 'ai';
import { useState } from 'react';
import { z } from 'zod';

const formulaSchema = z.object({
    formula: z.string(),
    explanation: z.string().optional(),
});

export const generateFormula = async (prompt: string, config: any, tableFields?: string[]) => {
    const provider = getProvider(config);
    const modelId = config.modelId;
    const llmodel = provider(modelId) as LanguageModel;

    let fieldsContext = '';
    if (tableFields && tableFields.length > 0) {
        fieldsContext = `
    ---
    <table_fields>
    ${tableFields.join('\n    ')}
    </table_fields>
    ---`;
    }

    const res = await generateObject({
        model: llmodel,
        schema: formulaSchema,
        prompt: `You are a SQLite expression expert. Generate an appropriate SQLite computed column expression based on the user's input. The user's input is enclosed in <user_input> tags. Please follow these rules:
    1. The returned expression should be a valid SQLite expression that can be used for computed columns
    2. Provide a brief explanation of how the expression works
    3. Ensure the expression syntax is correct and can be used directly in SQLite
    4. Supported functions include: ABS, COALESCE, IFNULL, INSTR, LENGTH, LOWER, UPPER, LTRIM, RTRIM, MAX, MIN, RANDOM, ROUND, SUBSTR, TRIM and other SQLite functions
    5. Supported operators include: +, -, *, /, %, ||, AND, OR, NOT, <, >, <=, >=, =, !=, IS, IS NOT, IN, LIKE, GLOB, BETWEEN
    6. All field names must be enclosed in double quotes, e.g., "field_name", to follow SQLite conventions
    7. If available, use the field names provided in the <table_fields> tags${fieldsContext}
    ---
    <user_input>
    ${prompt}
    </user_input>
    ---
    `,
    });
    return res.object;
};

export const useGenerateFormula = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [formula, setFormula] = useState<{
        formula: string;
        explanation?: string;
    } | null>(null);

    const {
        getConfigByModel,
        codingModel,
    } = useAiConfig();

    const generateFormulaConfig = async (userPrompt: string, tableFields: string[] = [], model: string = codingModel ?? '',) => {
        let result = null;
        setIsLoading(true);
        try {
            result = await generateFormula(userPrompt, getConfigByModel(model), tableFields);
            setFormula(result);
            return result;
        } catch (error) {
            setError(error as Error);
        } finally {
            setIsLoading(false);
        }
        return result;
    };

    return {
        isLoading,
        error,
        formula,
        generateFormulaConfig,
    };
};
