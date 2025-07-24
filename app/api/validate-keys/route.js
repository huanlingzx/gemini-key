// app/api/validate-keys/route.js
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client'; // 导入 PrismaClient

const prisma = new PrismaClient(); // 初始化 Prisma Client

// const GEMINI_API_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_API_MODELS_URL = 'https://api-proxy.me/gemini/v1beta/models';


export async function POST(request) {
    try {
        const { keys, action, count } = await request.json(); // ✨ 接收 count 字段

        // --- 处理 "fetchAll" 动作：只返回所有数据库中的 Key ---
        if (action === 'fetchAll') {
            const allKeysInDb = await prisma.apiKey.findMany({
                orderBy: {
                    createdAt: 'desc'
                }
            });
            await prisma.$disconnect();
            return NextResponse.json(allKeysInDb);
        }

        // --- 处理 "clearInvalid" 动作：删除所有无效 Key ---
        if (action === 'clearInvalid') {
            const deleteResult = await prisma.apiKey.deleteMany({
                where: {
                    status: {
                        in: ['invalid', 'error'] // 删除状态为 'invalid' 或 'error' 的 Key
                    }
                }
            });
            await prisma.$disconnect();
            return NextResponse.json({ message: `成功删除了 ${deleteResult.count} 个无效 Key。` });
        }

        // --- 默认处理 "validateAndSave" 动作（或没有 action 字段时）---
        if (!Array.isArray(keys) || keys.length === 0) {
            // 如果不是上述特殊动作且 keys 为空，则返回错误
            await prisma.$disconnect();
            return NextResponse.json({ error: '请提供 API Keys 数组进行验证。' }, { status: 400 });
        }

        const batchValidationResults = [];

        for (const key of keys) {
            let status = 'unknown';
            let errorMessage = null;

            try {
                const response = await fetch(GEMINI_API_MODELS_URL, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': key,
                        'X-Goog-Api-Client': 'nextjs-gemini-key-validator/1.0.0 (Custom Backend)',
                    },
                });
                const data = await response.json();

                if (response.ok) {
                    if (data.models && Array.isArray(data.models)) {
                        status = 'valid';
                    } else {
                        status = 'invalid';
                        errorMessage = data.error && data.error.message ? data.error.message : 'API 响应异常，未获取到模型列表。';
                    }
                } else {
                    status = 'invalid';
                    errorMessage = data.error && data.error.message ? data.error.message : `HTTP 错误: ${response.status} ${response.statusText}`;
                }
            } catch (error) {
                status = 'error';
                errorMessage = `网络或服务器错误: ${error.message}`;
            }

            // 数据库操作：查找或创建/更新 API Key 记录
            try {
                const existingKey = await prisma.apiKey.findUnique({
                    where: { keyString: key },
                });

                if (existingKey) {
                    await prisma.apiKey.update({
                        where: { id: existingKey.id },
                        data: {
                            status: status,
                            errorMessage: errorMessage,
                        },
                    });
                } else {
                    await prisma.apiKey.create({
                        data: {
                            keyString: key,
                            status: status,
                            errorMessage: errorMessage,
                        },
                    });
                }
                // 将当前 Key 的最新状态添加到批次结果中
                batchValidationResults.push({ keyString: key, status, errorMessage });

            } catch (dbError) {
                console.error(`数据库操作失败 for key ${key}:`, dbError);
                batchValidationResults.push({ keyString: key, status: 'db_error', errorMessage: `数据库保存失败: ${dbError.message}` });
            }
        }

        // 返回当前批次处理的 Keys 及其状态
        return NextResponse.json(batchValidationResults);

    } catch (error) {
        console.error('API Key 验证后端错误:', error);
        return NextResponse.json({ error: '服务器内部错误。' }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
