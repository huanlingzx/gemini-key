// app/api/validate-keys/route.js
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client'; // 导入 PrismaClient

const prisma = new PrismaClient(); // 初始化 Prisma Client

// const GEMINI_API_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_API_MODELS_URL = 'https://api-proxy.me/v1beta/models';

export async function POST(request) {
    try {
        const { keys } = await request.json();

        if (!Array.isArray(keys) || keys.length === 0) {
            return NextResponse.json({ error: '请提供 API Keys 数组。' }, { status: 400 });
        }

        const currentValidationResults = []; // 用于存储本次请求的验证结果

        for (const key of keys) {
            let status = 'unknown';
            let errorMessage = null; // 默认为 null

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

            // ✨ 数据库操作：查找或创建/更新 API Key 记录
            try {
                const existingKey = await prisma.apiKey.findUnique({
                    where: { key: key },
                });

                if (existingKey) {
                    // 如果 Key 已存在，则更新其状态和验证时间
                    await prisma.apiKey.update({
                        where: { id: existingKey.id },
                        data: {
                            status: status,
                            errorMessage: errorMessage,
                            // lastValidatedAt 会由 @updatedAt 自动更新
                        },
                    });
                } else {
                    // 如果 Key 不存在，则创建新记录
                    await prisma.apiKey.create({
                        data: {
                            key: key,
                            status: status,
                            errorMessage: errorMessage,
                        },
                    });
                }
                // 将本次验证结果添加到返回列表
                currentValidationResults.push({ key, status, errorMessage });

            } catch (dbError) {
                console.error(`数据库操作失败 for key ${key}:`, dbError);
                currentValidationResults.push({ key, status: 'db_error', errorMessage: `数据库保存失败: ${dbError.message}` });
            }
        }

        // 返回所有当前数据库中的 API Key 及其最新状态
        // 这样前端可以获取到完整的、最新的 Key 列表
        const allKeysInDb = await prisma.apiKey.findMany({
            orderBy: {
                createdAt: 'desc' // 按创建时间排序
            }
        });

        return NextResponse.json(allKeysInDb);

    } catch (error) {
        console.error('API Key 验证后端错误:', error);
        return NextResponse.json({ error: '服务器内部错误。' }, { status: 500 });
    } finally {
        // 确保在请求结束时断开数据库连接
        await prisma.$disconnect();
    }
}
