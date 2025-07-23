// app/page.js
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';

const BATCH_SIZE = 10; // 每批处理的 Key 数量

export default function HomePage() {
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [identifiedKeys, setIdentifiedKeys] = useState([]);
    const [dbKeys, setDbKeys] = useState([]);
    const [isLoadingDetect, setIsLoadingDetect] = useState(false);
    const [isLoadingValidate, setIsLoadingValidate] = useState(false);
    const [detectMessage, setDetectMessage] = useState('');
    const [initialLoad, setInitialLoad] = useState(true);

    // 进度条状态
    const [progress, setProgress] = useState(0); // 0-100%
    const [currentProcessed, setCurrentProcessed] = useState(0); // 当前已处理数量
    const [totalKeysToProcess, setTotalKeysToProcess] = useState(0); // 总共需要处理的数量

    // ... (getTranslatedStatus 和 getStatusColorClass 保持不变)
    const getTranslatedStatus = useCallback((status) => {
        switch (status) {
            case 'valid': return '有效';
            case 'invalid': return '无效';
            case 'error': return '错误';
            case 'info': return '信息';
            case 'db_error': return '数据库错误';
            case 'unknown': return '未知';
            default: return status;
        }
    }, []);

    const getStatusColorClass = useCallback((status) => {
        switch (status) {
            case 'valid': return 'text-green-600';
            case 'invalid': return 'text-red-600';
            case 'error': case 'db_error': return 'text-orange-600';
            case 'info': return 'text-blue-600';
            default: return 'text-gray-600';
        }
    }, []);


    // 加载所有已保存的 Key
    const loadAllKeysFromDb = useCallback(async () => {
        try {
            // 这里我们调用 validate-keys 路由，发送空数组，表示只获取所有 Key
            const response = await fetch('/api/validate-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys: [], action: 'fetchAll' }), // ✨ 新增 action 字段
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `加载 Key 列表失败: ${response.status} ${response.statusText}`);
            }

            const keys = await response.json();
            setDbKeys(keys);
        } catch (error) {
            console.error('加载数据库 Key 列表失败:', error);
            setDbKeys([{ id: 'load-error', keyString: "加载失败", status: "error", errorMessage: `无法从数据库加载: ${error.message}` }]);
        } finally {
            setInitialLoad(false);
        }
    }, []);

    useEffect(() => {
        loadAllKeysFromDb();
    }, [loadAllKeysFromDb]);

    // API Key 识别逻辑 (不变)
    const detectGeminiApiKeys = () => {
        setIsLoadingDetect(true);
        setIdentifiedKeys([]);
        setDetectMessage('');
        // setValidationResults([]); // 清空之前的验证结果
        setProgress(0);
        setCurrentProcessed(0);
        setTotalKeysToProcess(0);

        const rawInput = apiKeyInput;
        const apiKeyRegex = /AIzaSy[0-9a-zA-Z_-]{33}/;

        let uniqueKeys = new Set();
        const segments = rawInput
            .replace(/\r\n/g, '\n')
            .split(/[;,:\n]+/);

        segments.forEach(segment => {
            const cleanedSegment = segment.replace(/\s+/g, '');
            const match = cleanedSegment.match(apiKeyRegex);
            if (match) {
                uniqueKeys.add(match[0]);
            }
        });

        const keysArray = Array.from(uniqueKeys);
        setIdentifiedKeys(keysArray);

        if (keysArray.length > 0) {
            setDetectMessage(`✨ 识别到 ${keysArray.length} 个 Gemini API Key。`);
        } else {
            setDetectMessage('🔍 未识别到有效的 Gemini API Key。请检查输入格式。');
        }
        setIsLoadingDetect(false);
    };

    // API Key 验证逻辑 (分批发送)
    const validateGeminiApiKeys = async () => {
        if (identifiedKeys.length === 0) {
            setDbKeys([{ id: 'no-key-to-validate', keyString: "无密钥", status: "info", errorMessage: "请先识别密钥。" }]);
            return;
        }

        setIsLoadingValidate(true);
        setDbKeys([]); // 验证前清空当前的显示，待分批更新
        setCurrentProcessed(0);
        setTotalKeysToProcess(identifiedKeys.length); // 设置总数

        const totalKeys = identifiedKeys.length;
        let processedCount = 0;

        for (let i = 0; i < totalKeys; i += BATCH_SIZE) {
            const batch = identifiedKeys.slice(i, i + BATCH_SIZE);
            try {
                const response = await fetch('/api/validate-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keys: batch, action: 'validateAndSave' }), // ✨ 新增 action
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `后端服务器错误: ${response.status} ${response.statusText}`);
                }

                const batchResults = await response.json(); // 后端返回的是处理过的这批 Key
                // 合并新批次的结果到现有 dbKeys
                setDbKeys(prevKeys => {
                    // 过滤掉新批次中可能与旧批次重复的 Key，确保唯一性（基于 keyString）
                    const newKeysMap = new Map(batchResults.map(k => [k.keyString, k]));
                    const filteredPrevKeys = prevKeys.filter(pk => !newKeysMap.has(pk.keyString));
                    return [...filteredPrevKeys, ...batchResults];
                });

                processedCount += batch.length;
                setCurrentProcessed(processedCount);
                setProgress(Math.round((processedCount / totalKeys) * 100));

            } catch (error) {
                console.error('API Key 验证请求失败:', error);
                // 即使失败，也更新进度，并显示错误
                setDbKeys(prevKeys => [...prevKeys, { id: `batch-error-${i}`, keyString: `批次 ${i/BATCH_SIZE + 1} 验证失败`, status: "error", errorMessage: `验证请求失败: ${error.message}` }]);
                // 可以选择中断或继续
                break; // 遇到错误就停止
            }
        }
        setIsLoadingValidate(false);
        // 验证完成后再次加载所有 Key，确保显示最新、最完整的数据
        await loadAllKeysFromDb();
    };


    // 导出正常 Key 的功能 (不变)
    const exportValidKeys = useCallback(() => {
        const validKeys = dbKeys
            .filter(item => item.status === 'valid')
            .map(item => item.keyString);

        if (validKeys.length === 0) {
            alert('没有找到有效的 Key 可以导出。');
            return;
        }

        const blob = new Blob([validKeys.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemini_valid_keys_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [dbKeys]);

    // 判断是否有有效的 Key 可以导出
    const hasValidKeysToExport = dbKeys.some(item => item.status === 'valid');

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-3xl bg-white shadow-lg rounded-xl my-8">
            <h1 className="text-3xl md:text-4xl font-bold text-center text-gray-800 mb-6 flex items-center justify-center">
                <span className="mr-3 text-blue-500">✨</span> Gemini API Key 工具
            </h1>

            <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 rounded-md">
                <p className="font-semibold mb-1">💡 使用说明：</p>
                <p className="text-sm">
                    请在下方输入框中粘贴您的 Gemini API Key 文本。工具会智能识别，即使密钥被换行或分隔符打断也能识别。<br />
                    识别出所有 Key 后，点击 <span className="font-bold">&quot;🚀 批量验证 Keys&quot;</span> 按钮，工具将通过后端服务器安全地验证每个 Key 是否可用。
                    验证完成后，您可以导出所有<span className="font-bold text-green-700">有效的 Key</span>。
                </p>
                <pre className="mt-3 p-2 bg-yellow-100 rounded text-xs overflow-auto">
                    AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe;<br />
                    AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe; AIzaSyDaGmWKa4<br />
                    JsXZ-HjGw7ISLn_3namBGewQe:AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe,<br />
                    INVALID_KEY_PART;AIzaSyAnotherValidKey_With_33_Chars_Here
                </pre>
            </div>

            <textarea
                id="apiKeyInput"
                className="w-full p-4 border border-gray-300 rounded-lg text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y min-h-[150px] mb-4"
                placeholder="在此粘贴您的 Gemini API Keys..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
            ></textarea>

            <Button
                onClick={detectGeminiApiKeys}
                disabled={isLoadingDetect}
                className="w-full py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
            >
                {isLoadingDetect ? '识别中...' : '🔎 识别 API Keys'}
            </Button>

            {detectMessage && (
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-md">
                    <h3 className="font-bold mb-2 flex items-center text-lg">
                        <span className="mr-2">{detectMessage.startsWith('✨') ? '✅' : '⚠️'}</span> 识别结果
                    </h3>
                    <p>{detectMessage}</p>
                    {identifiedKeys.length > 0 && (
                        <div className="mt-4">
                            <h4 className="font-semibold mb-2">识别到的 Key ({identifiedKeys.length} 个):</h4>
                            <pre className="p-3 bg-gray-100 rounded-md text-sm font-mono max-h-40 overflow-auto whitespace-pre-wrap break-all">
                                {identifiedKeys.join('\n')}
                            </pre>
                            <Button
                                onClick={validateGeminiApiKeys}
                                disabled={isLoadingValidate || identifiedKeys.length === 0}
                                className="w-full mt-4 py-3 text-lg bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200"
                            >
                                {isLoadingValidate ? '验证中...' : '🚀 批量验证 Keys 并保存'}
                            </Button>

                            {/* 进度条和数量显示 */}
                            {isLoadingValidate && totalKeysToProcess > 0 && (
                                <div className="mt-4">
                                    <div className="text-center text-sm mb-2">
                                        处理进度: {currentProcessed} / {totalKeysToProcess} Key ({progress}%)
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                        <div
                                            className="bg-blue-600 h-2.5 rounded-full"
                                            style={{ width: `${progress}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* 显示所有数据库中的 Key */}
            <div className="mt-6 p-4 bg-purple-50 border border-purple-200 text-purple-800 rounded-md">
                <h3 className="font-bold mb-2 flex items-center text-lg">
                    <span className="mr-2">🗄️</span> 已保存的 API Keys
                    {initialLoad && <span className="ml-2 text-sm text-gray-600">加载中...</span>}
                    {!initialLoad && dbKeys.length > 0 && <span className="ml-2 text-sm text-gray-600">({dbKeys.length} 个)</span>}
                </h3>
                <ul className="list-none p-0 max-h-60 overflow-auto">
                    {!initialLoad && dbKeys.length === 0 && (
                        <li className="text-gray-600 italic">数据库中暂无 Key。</li>
                    )}
                    {dbKeys.map((item) => (
                        <li key={item.id} className="flex items-start py-2 border-b border-purple-100 last:border-b-0">
                            <span className="mr-2 text-xl">
                                {item.status === 'valid' && '✅'}
                                {item.status === 'invalid' && '❌'}
                                {item.status === 'error' && '⚠️'}
                                {item.status === 'info' && '💡'}
                                {item.status === 'db_error' && '❗'}
                                {item.status === 'unknown' && '❓'}
                            </span>
                            <div className="flex-1">
                                <code className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm font-mono break-all">
                                    {item.keyString}
                                </code>
                                <p className={`text-sm mt-1 ${getStatusColorClass(item.status)}`}>
                                    状态: {getTranslatedStatus(item.status)}
                                    {item.errorMessage && <span className="text-gray-600 italic"> ({item.errorMessage})</span>}
                                </p>
                                {item.lastValidatedAt && (
                                    <p className="text-xs text-gray-500">
                                        最后验证: {new Date(item.lastValidatedAt).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
                {/* 导出按钮 */}
                {hasValidKeysToExport && (
                    <Button
                        onClick={exportValidKeys}
                        className="w-full mt-4 py-3 text-lg bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-200"
                    >
                        ⬇️ 导出有效的 Keys
                    </Button>
                )}
            </div>
        </div>
    );
}
