// app/page.js
'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner'; // ✨ 导入 toast

const BATCH_SIZE = 50; // 每批处理的 Key 数量

export default function HomePage() {
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [identifiedKeys, setIdentifiedKeys] = useState([]);
    const [dbKeys, setDbKeys] = useState([]);
    const [isLoadingDetect, setIsLoadingDetect] = useState(false);
    const [isLoadingValidate, setIsLoadingValidate] = useState(false);
    const [detectMessage, setDetectMessage] = useState('');
    const [initialLoad, setInitialLoad] = useState(true);

    // 进度条状态
    const [progress, setProgress] = useState(0);
    const [currentProcessed, setCurrentProcessed] = useState(0);
    const [totalKeysToProcess, setTotalKeysToProcess] = useState(0);

    // 验证结果统计
    const [newValidKeysCount, setNewValidKeysCount] = useState(0);

    // 随机选取 Key 的状态
    const [randomSelectCount, setRandomSelectCount] = useState(1);
    const [isCopying, setIsCopying] = useState(false);

    // ... (getTranslatedStatus 和 getStatusColorClass 保持不变)
    const getTranslatedStatus = useCallback((status) => {
        switch (status) {
            case 'valid': return '有效';
            case 'invalid': return '无效';
            case 'error': return '错误';
            case 'info': return '信息';
            case 'db_error': return '数据库错误';
            case 'unknown': return '未知';
            case 'deleted': return '已删除';
            default: return status;
        }
    }, []);

    const getStatusColorClass = useCallback((status) => {
        switch (status) {
            case 'valid': return 'text-green-600';
            case 'invalid': return 'text-red-600';
            case 'error': case 'db_error': return 'text-orange-600';
            case 'info': return 'text-blue-600';
            case 'deleted': return 'text-gray-500';
            default: return 'text-gray-600';
        }
    }, []);

    const totalValidKeysInDb = useMemo(() => {
        return dbKeys.filter(item => item.status === 'valid').length;
    }, [dbKeys]);


    const loadAllKeysFromDb = useCallback(async () => {
        try {
            const response = await fetch('/api/validate-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys: [], action: 'fetchAll' }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `加载 Key 列表失败: ${response.status} ${response.statusText}`);
            }

            const keys = await response.json();
            setDbKeys(keys);
        } catch (error) {
            console.error('加载数据库 Key 列表失败:', error);
            toast.error(`加载数据库 Key 列表失败: ${error.message}`); // ✨ 使用 toast
            setDbKeys([{ id: 'load-error', keyString: "加载失败", status: "error", errorMessage: `无法从数据库加载: ${error.message}` }]);
        } finally {
            setInitialLoad(false);
        }
    }, []);

    useEffect(() => {
        loadAllKeysFromDb();
    }, [loadAllKeysFromDb]);

    const detectGeminiApiKeys = () => {
        setIsLoadingDetect(true);
        setIdentifiedKeys([]);
        setDetectMessage('');
        setProgress(0);
        setCurrentProcessed(0);
        setTotalKeysToProcess(0);
        setNewValidKeysCount(0);

        const rawInput = apiKeyInput;
        const apiKeyRegex = /AIzaSy[0-9a-zA-Z_-]{30,}/;

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

    const validateGeminiApiKeys = async () => {
        if (identifiedKeys.length === 0) {
            toast.info("请先识别密钥。"); // ✨ 使用 toast
            setDbKeys([{ id: 'no-key-to-validate', keyString: "无密钥", status: "info", errorMessage: "请先识别密钥。" }]);
            return;
        }

        setIsLoadingValidate(true);
        setDbKeys([]);
        setCurrentProcessed(0);
        setTotalKeysToProcess(identifiedKeys.length);
        setNewValidKeysCount(0);

        const totalKeys = identifiedKeys.length;
        let processedCount = 0;
        let newlyValidatedCount = 0;

        for (let i = 0; i < totalKeys; i += BATCH_SIZE) {
            const batch = identifiedKeys.slice(i, i + BATCH_SIZE);
            try {
                const response = await fetch('/api/validate-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keys: batch, action: 'validateAndSave' }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `后端服务器错误: ${response.status} ${response.statusText}`);
                }

                const batchResults = await response.json();

                setDbKeys(prevKeys => {
                    const newKeysMap = new Map(batchResults.map(k => [k.keyString, k]));
                    const filteredPrevKeys = prevKeys.filter(pk => !newKeysMap.has(pk.keyString));
                    const updatedKeys = [...filteredPrevKeys, ...batchResults];

                    batchResults.forEach(item => {
                        const oldKey = prevKeys.find(pk => pk.keyString === item.keyString);
                        if (item.status === 'valid' && (!oldKey || oldKey.status !== 'valid')) {
                            newlyValidatedCount++;
                        }
                    });
                    setNewValidKeysCount(newlyValidatedCount);

                    return updatedKeys;
                });

                processedCount += batch.length;
                setCurrentProcessed(processedCount);
                setProgress(Math.round((processedCount / totalKeys) * 100));

            } catch (error) {
                console.error('API Key 验证请求失败:', error);
                toast.error(`API Key 验证请求失败: ${error.message}`); // ✨ 使用 toast
                setDbKeys(prevKeys => [...prevKeys, { id: `batch-error-${i}`, keyString: `批次 ${i/BATCH_SIZE + 1} 验证失败`, status: "error", errorMessage: `验证请求失败: ${error.message}` }]);
                break;
            }
        }
        setIsLoadingValidate(false);
        await loadAllKeysFromDb();
        toast.success("所有 Key 验证完成！"); // ✨ 验证完成后提示
    };

    const exportValidKeys = useCallback(() => {
        const validKeys = dbKeys
            .filter(item => item.status === 'valid')
            .map(item => item.keyString);

        if (validKeys.length === 0) {
            toast.info('没有找到有效的 Key 可以导出。'); // ✨ 使用 toast
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
        toast.success("有效 Key 已导出！"); // ✨ 导出成功提示
    }, [dbKeys]);

    const clearInvalidKeys = useCallback(async () => {
        if (!confirm('确定要从数据库中删除所有无效的 Key 吗？此操作不可逆！')) {
            return;
        }

        try {
            const response = await fetch('/api/validate-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clearInvalid' }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `清除无效 Key 失败: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            toast.success(result.message); // ✨ 使用 toast
            await loadAllKeysFromDb();
        } catch (error) {
            console.error('清除无效 Key 请求失败:', error);
            toast.error(`清除无效 Key 失败: ${error.message}`); // ✨ 使用 toast
        }
    }, [loadAllKeysFromDb]);

    const selectRandomKeys = useCallback(async () => {
        if (randomSelectCount <= 0 || !Number.isInteger(Number(randomSelectCount))) {
            toast.error('请输入一个有效的正整数作为选取数量。'); // ✨ 使用 toast
            return;
        }
        if (totalValidKeysInDb === 0) {
            toast.info('数据库中没有有效的 Key 可供选取。'); // ✨ 使用 toast
            return;
        }
        if (randomSelectCount > totalValidKeysInDb) {
            toast.info(`您请求选取 ${randomSelectCount} 个 Key，但数据库中只有 ${totalValidKeysInDb} 个有效 Key。`); // ✨ 使用 toast
            return;
        }

        setIsCopying(true);
        try {
            const validKeys = dbKeys.filter(item => item.status === 'valid').map(item => item.keyString);

            const numToSelect = Math.min(Number(randomSelectCount), validKeys.length);
            const shuffledKeys = validKeys.sort(() => 0.5 - Math.random());
            const selectedKeys = shuffledKeys.slice(0, numToSelect);

            try {
                await navigator.clipboard.writeText(selectedKeys.join('\n'));
                toast.success(`已成功选取 ${selectedKeys.length} 个 Key 并复制到剪贴板！`); // ✨ 使用 toast
            } catch (clipboardError) {
                console.error('复制到剪贴板失败:', clipboardError);
                // 移除备用方案，只提示用户
                toast.error(`复制到剪贴板失败: ${clipboardError.message}`); // ✨ 使用 toast
            }

        } catch (error) {
            console.error('随机选取 Key 失败:', error);
            toast.error(`随机选取 Key 失败: ${error.message}`); // ✨ 使用 toast
        } finally {
            setIsCopying(false);
        }
    }, [randomSelectCount, totalValidKeysInDb, dbKeys]);

    const hasValidKeysToExport = totalValidKeysInDb > 0;

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
                {/* 验证结果统计 */}
                {newValidKeysCount > 0 && (
                    <p className="text-md font-semibold text-green-700 mb-2">
                        🎉 本次验证新增/更新有效 Key: {newValidKeysCount} 个
                    </p>
                )}
                <p className="text-md font-semibold text-gray-700 mb-3">
                    当前数据库中有效 Key 总数: {totalValidKeysInDb} 个
                </p>

                <ul className="list-none p-0 max-h-60 overflow-auto border rounded-md border-purple-100">
                    {!initialLoad && dbKeys.length === 0 && (
                        <li className="p-2 text-gray-600 italic">数据库中暂无 Key。</li>
                    )}
                    {dbKeys.map((item) => (
                        <li key={item.id} className="flex items-start py-2 px-2 border-b border-purple-100 last:border-b-0">
                            <span className="mr-2 text-xl">
                                {item.status === 'valid' && '✅'}
                                {item.status === 'invalid' && '❌'}
                                {item.status === 'error' && '⚠️'}
                                {item.status === 'info' && '💡'}
                                {item.status === 'db_error' && '❗'}
                                {item.status === 'unknown' && '❓'}
                                {item.status === 'deleted' && '🗑️'}
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

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* 导出按钮 */}
                    {hasValidKeysToExport && (
                        <Button
                            onClick={exportValidKeys}
                            className="w-full py-3 text-lg bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-200"
                        >
                            ⬇️ 导出有效的 Keys
                        </Button>
                    )}

                    {/* 清除无效 Key 按钮 */}
                    <Button
                        onClick={clearInvalidKeys}
                        className="w-full py-3 text-lg bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200"
                    >
                        🗑️ 清除所有无效 Keys
                    </Button>
                </div>

                {/* 随机选取 Key 功能 */}
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-md">
                    <h3 className="font-bold mb-3 flex items-center text-lg">
                        <span className="mr-2">🎲</span> 随机选取有效 Key
                    </h3>
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                        <input
                            type="number"
                            min="1"
                            value={randomSelectCount}
                            onChange={(e) => setRandomSelectCount(Number(e.target.value))}
                            className="w-24 p-2 border border-gray-300 rounded-md text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                            aria-label="选取数量"
                        />
                        <Button
                            onClick={selectRandomKeys}
                            disabled={isCopying || totalValidKeysInDb === 0}
                            className="flex-1 py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
                        >
                            {isCopying ? '复制中...' : '📋 选取并复制到剪贴板'}
                        </Button>
                    </div>
                    {totalValidKeysInDb === 0 && (
                        <p className="text-sm text-gray-600 mt-2">（当前无有效 Key 可供选取）</p>
                    )}
                </div>
            </div>
        </div>
    );
}
