import React, { useState } from 'react';
import { Card } from '../components/ui/Card';

interface CryptoInfoResponse {
  ok: boolean;
  encryption?: {
    algorithm: string;
    oaepHash: string;
    inputEncoding: string;
    outputEncoding: string;
    keyFormat: string;
    ready: boolean;
    publicKeyConfigured?: boolean;
    privateKeyConfigured?: boolean;
    publicKeyPemValid?: boolean;
    privateKeyPemValid?: boolean;
  };
}

interface CryptoTestResponse {
  algorithm: string;
  oaepHash: string;
  inputEncoding: string;
  outputEncoding: string;
  plainText?: string;
  cipherText?: string;
  encryptedText?: string;
  decryptedText?: string;
  roundTripOk?: boolean;
  errors: string[];
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const CryptoLab: React.FC = () => {
  const [plainText, setPlainText] = useState('hello-atour');
  const [cipherText, setCipherText] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [testingEncrypt, setTestingEncrypt] = useState(false);
  const [testingDecrypt, setTestingDecrypt] = useState(false);
  const [error, setError] = useState('');
  const [cryptoInfo, setCryptoInfo] = useState<CryptoInfoResponse | null>(null);
  const [testResult, setTestResult] = useState<CryptoTestResponse | null>(null);

  const loadCryptoInfo = async () => {
    setLoadingInfo(true);
    setError('');
    try {
      const res = await fetch('/api/health/crypto');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '获取算法信息失败');
      }
      const data = await res.json();
      setCryptoInfo(data);
    } catch (err) {
      setError(getErrorMessage(err, '获取算法信息失败'));
    } finally {
      setLoadingInfo(false);
    }
  };

  const runEncryptTest = async () => {
    setTestingEncrypt(true);
    setError('');
    setTestResult(null);
    try {
      const res = await fetch('/api/health/crypto/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plainText })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.errors?.join('; ') || '加密测试失败');
      }
      setTestResult(data);
      if (data.encryptedText) {
        setCipherText(data.encryptedText);
      }
    } catch (err) {
      setError(getErrorMessage(err, '加密测试失败'));
    } finally {
      setTestingEncrypt(false);
    }
  };

  const runDecryptTest = async () => {
    setTestingDecrypt(true);
    setError('');
    setTestResult(null);
    try {
      const res = await fetch('/api/health/crypto/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cipherText })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.errors?.join('; ') || '解密测试失败');
      }
      setTestResult(data);
    } catch (err) {
      setError(getErrorMessage(err, '解密测试失败'));
    } finally {
      setTestingDecrypt(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="加解密算法测试（仅开发环境）">
        <p className="text-sm text-gray-600">
          本页面仅用于联调，不应在生产环境暴露。若接口不可用，通常是因为当前不是 development 环境。
        </p>
      </Card>

      <Card
        title="算法信息"
        action={
          <button
            onClick={loadCryptoInfo}
            disabled={loadingInfo}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {loadingInfo ? '加载中...' : '刷新'}
          </button>
        }
      >
        {!cryptoInfo && <p className="text-sm text-gray-500">点击右上角“刷新”获取当前算法配置。</p>}
        {cryptoInfo?.encryption && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">算法: {cryptoInfo.encryption.algorithm}</div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">哈希: {cryptoInfo.encryption.oaepHash}</div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">输入编码: {cryptoInfo.encryption.inputEncoding}</div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">输出编码: {cryptoInfo.encryption.outputEncoding}</div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">密钥格式: {cryptoInfo.encryption.keyFormat}</div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
              密钥状态: {cryptoInfo.encryption.ready ? 'Ready' : 'Not Ready'}
            </div>
          </div>
        )}
      </Card>

      <Card title="加密/解密测试">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">明文</label>
            <textarea
              value={plainText}
              onChange={(e) => setPlainText(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入待加密明文"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">密文（Base64）</label>
            <textarea
              value={cipherText}
              onChange={(e) => setCipherText(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入待解密密文，或先点击“加密测试”自动填充"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={runEncryptTest}
              disabled={testingEncrypt}
              className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:bg-gray-300"
            >
              {testingEncrypt ? '加密中...' : '加密测试'}
            </button>
            <button
              onClick={runDecryptTest}
              disabled={testingDecrypt}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:bg-gray-300"
            >
              {testingDecrypt ? '解密中...' : '解密测试'}
            </button>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

          {testResult && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-2">
              <div>算法: {testResult.algorithm}</div>
              <div>哈希: {testResult.oaepHash}</div>
              {typeof testResult.roundTripOk === 'boolean' && (
                <div>回环校验: {testResult.roundTripOk ? '通过' : '失败'}</div>
              )}
              {testResult.decryptedText !== undefined && <div>解密结果: {testResult.decryptedText}</div>}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
