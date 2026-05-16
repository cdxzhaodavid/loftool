import { useState, useEffect } from 'react';
import { Card, Button, DatePicker, Space, Empty, Spin, message } from 'antd';
import ReactECharts from 'echarts-for-react';
import { fundsAPI } from '../api';

const { RangePicker } = DatePicker;

const IntradayChart = ({ fundCode }) => {
  const [loading, setLoading] = useState(false);
  const [intradayData, setIntradayData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [priceChange, setPriceChange] = useState(0);
  const [priceChangePercent, setPriceChangePercent] = useState(0);

  const loadIntradayData = async (date = null) => {
    if (!fundCode) return;
    
    setLoading(true);
    try {
      const response = await fundsAPI.intraday(fundCode, date);
      if (response.data) {
        setIntradayData(response.data);
        
        // 计算涨跌
        if (response.data.prices && response.data.prices.length > 0) {
          const firstPrice = parseFloat(response.data.prices[0]);
          const lastPrice = parseFloat(response.data.prices[response.data.prices.length - 1]);
          const change = lastPrice - firstPrice;
          const changePercent = firstPrice > 0 ? (change / firstPrice * 100) : 0;
          setPriceChange(change);
          setPriceChangePercent(changePercent);
        }
      } else {
        setIntradayData(null);
        message.warning('暂无分时数据');
      }
    } catch (error) {
      setIntradayData(null);
      message.error('获取分时数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntradayData();
  }, [fundCode]);

  const handleDateChange = (date, dateString) => {
    if (dateString) {
      setSelectedDate(dateString);
      loadIntradayData(dateString);
    }
  };

  const handleToday = () => {
    setSelectedDate(null);
    loadIntradayData();
  };

  const chartOption = () => {
    if (!intradayData) return {};

    const prices = intradayData.prices.map(p => parseFloat(p));
    const volumes = intradayData.volumes;
    const avgPrices = intradayData.avg_prices.map(p => parseFloat(p));
    
    // 计算价格范围
    const minPrice = Math.min(...prices, ...avgPrices);
    const maxPrice = Math.max(...prices, ...avgPrices);
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * 0.05 || 0.01;
    
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross'
        },
        formatter: (params) => {
          const time = params[0].axisValue;
          let result = `<div style="font-weight:bold;margin-bottom:4px;">${intradayData.date} ${time}</div>`;
          params.forEach(param => {
            result += `<div style="display:flex;justify-content:space-between;gap:20px;">
              <span>${param.marker}${param.seriesName}:</span>
              <span style="font-weight:bold;">${param.seriesName.includes('成交量') ? param.value + '手' : '¥' + param.value.toFixed(4)}</span>
            </div>`;
          });
          return result;
        }
      },
      grid: [
        {
          left: '5%',
          right: '5%',
          top: '5%',
          height: '55%'
        },
        {
          left: '5%',
          right: '5%',
          top: '68%',
          height: '25%'
        }
      ],
      xAxis: [
        {
          type: 'category',
          data: intradayData.times,
          axisLine: { lineStyle: { color: '#ccc' } },
          axisLabel: {
            color: '#666',
            fontSize: 10,
            interval: Math.floor(intradayData.times.length / 8)
          },
          splitLine: { show: false }
        },
        {
          type: 'category',
          gridIndex: 1,
          data: intradayData.times,
          axisLine: { lineStyle: { color: '#ccc' } },
          axisLabel: { show: false },
          splitLine: { show: false }
        }
      ],
      yAxis: [
        {
          type: 'value',
          scale: true,
          min: minPrice - padding,
          max: maxPrice + padding,
          axisLine: { show: false },
          axisLabel: {
            color: '#666',
            fontSize: 10,
            formatter: (value) => value.toFixed(4)
          },
          splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
        },
        {
          type: 'value',
          gridIndex: 1,
          axisLine: { show: false },
          axisLabel: {
            color: '#666',
            fontSize: 10,
            formatter: (value) => {
              if (value >= 10000) {
                return (value / 10000).toFixed(1) + '万';
              }
              return value.toString();
            }
          },
          splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
        }
      ],
      series: [
        {
          name: '价格',
          type: 'line',
          data: prices,
          smooth: false,
          symbol: 'none',
          lineStyle: {
            color: priceChange >= 0 ? '#cf1322' : '#3f8600',
            width: 2
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: priceChange >= 0 ? 'rgba(207, 19, 34, 0.2)' : 'rgba(63, 134, 0, 0.2)' },
                { offset: 1, color: 'rgba(207, 19, 34, 0.02)' }
              ]
            }
          }
        },
        {
          name: '均价',
          type: 'line',
          data: avgPrices,
          smooth: false,
          symbol: 'none',
          lineStyle: {
            color: '#1890ff',
            width: 1,
            type: 'dashed'
          }
        },
        {
          name: '成交量',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
          itemStyle: {
            color: (params) => {
              const idx = params.dataIndex;
              if (idx === 0) return priceChange >= 0 ? '#cf1322' : '#3f8600';
              return prices[idx] >= prices[idx - 1] ? '#cf1322' : '#3f8600';
            }
          }
        }
      ]
    };
  };

  return (
    <Card
      title="分时行情"
      extra={
        <Space>
          <Button
            size="small"
            type={!selectedDate ? 'primary' : 'default'}
            onClick={handleToday}
          >
            今日
          </Button>
          <DatePicker
            size="small"
            value={selectedDate ? new Date(selectedDate) : null}
            onChange={handleDateChange}
            placeholder="选择日期"
            style={{ width: 120 }}
          />
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin tip="加载中..." />
        </div>
      ) : intradayData ? (
        <>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 12,
            padding: '8px 16px',
            backgroundColor: priceChange >= 0 ? 'rgba(207, 19, 34, 0.05)' : 'rgba(63, 134, 0, 0.05)'
          }}>
            <span style={{ fontSize: 14, color: '#666' }}>
              当日走势
            </span>
            <span style={{ fontSize: 16, fontWeight: 'bold', color: priceChange >= 0 ? '#cf1322' : '#3f8600' }}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(4)} ({priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
            </span>
          </div>
          <ReactECharts
            option={chartOption()}
            style={{ height: 400 }}
            opts={{ renderer: 'canvas' }}
          />
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-around',
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid #f0f0f0'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>开盘</div>
              <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                ¥{parseFloat(intradayData.prices[0]).toFixed(4)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>最高</div>
              <div style={{ fontSize: 14, fontWeight: 'bold', color: '#cf1322' }}>
                ¥{Math.max(...intradayData.prices.map(p => parseFloat(p))).toFixed(4)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>最低</div>
              <div style={{ fontSize: 14, fontWeight: 'bold', color: '#3f8600' }}>
                ¥{Math.min(...intradayData.prices.map(p => parseFloat(p))).toFixed(4)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>成交量</div>
              <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                {(intradayData.volumes.reduce((a, b) => a + b, 0) / 10000).toFixed(1)}万手
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>成交额</div>
              <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                {(intradayData.amounts.reduce((a, b) => a + parseFloat(b), 0) / 10000).toFixed(1)}万元
              </div>
            </div>
          </div>
        </>
      ) : (
        <Empty description="暂无分时数据，支持盘后查看历史数据" />
      )}
    </Card>
  );
};

export default IntradayChart;