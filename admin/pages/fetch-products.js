/** @jsxRuntime classic */
/** @jsx jsx */
import { jsx, css, keyframes } from '@keystone-ui/core';
import React, { useState } from 'react';
import { Button } from '@keystone-ui/button';
import { PageContainer } from '@keystone-6/core/admin-ui/components';
import { useRouter } from 'next/router';

const spin = keyframes({ to: { transform: 'rotate(360deg)' } });

const spinnerStyle = css({
  display: 'inline-block',
  width: 16,
  height: 16,
  border: '2.5px solid rgba(255,255,255,0.3)',
  borderTopColor: '#fff',
  borderRadius: '50%',
  animation: `${spin} 0.6s linear infinite`,
  marginRight: 8,
  verticalAlign: 'middle',
});

export default function FetchProducts() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const fetchProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/fetch-products');
      const data = await response.json();
      if (!response.ok) throw new Error(data.details || 'Sync failed');
      router.push('/products');
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <PageContainer header="Fetch Products">
      <h1>Fetch Products from Google Sheets</h1>
      <p css={{ color: '#6b7280', marginBottom: 24 }}>
        Pull the latest products from the Google Sheet into the database.
      </p>
      <Button
        tone="active"
        weight="bold"
        onClick={fetchProducts}
        isDisabled={loading}
      >
        {loading && <span css={spinnerStyle} />}
        {loading ? 'Fetching Products...' : 'Fetch Products'}
      </Button>
      {error && (
        <p css={{ color: '#dc2626', marginTop: 16, fontSize: 14 }}>{error}</p>
      )}
    </PageContainer>
  );
}