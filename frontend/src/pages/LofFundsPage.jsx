import { useState, useEffect, useMemo } from 'react';
import { Card, Table, Input, Button, Space, message, Typography, Tag, Pagination, Row, Col, Statistic } from 'antd';
import { SearchOutlined, EyeOutlined, TrendingUpOutlined, TrendingDownOutlined, BarChart3Outlined } from '@ant-design/icons';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';
import ReactECharts from 'echarts-for-react';
import { fundsAPI } from '../api';

const { Text } = Typography;

const ResizableTitle = (props) => {
  const { onResize, width, ...restProps } = props;

  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e) => e.stopPropagation()}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

const LofFundsPage = () => {
  const [loading, setLoading] = useState(false);
  const [funds, setFunds] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedFund, setSelectedFund] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const pageSize = 10;

  const [columnWidths, setColumnWidths] = useState({
    fund_code: 80,
    fund_name: 200,
    close_price: 100,
    vst_nav: 100,
    estimate_nav: 100,
    unit_nav: 100,
    premium: 80,
    market_share: 120,
    daily_share_change: 120,
    estimate_error: 80,
    action: 60,
  });

  const handleResize = (key) => (e, { size }) => {
    setColumnWidths((prev) => ({
      ...prev,
      [key]: size.width,
    }));
  };

  const loadLofFunds = async (searchValue = search, pageNum = page) => {
    setLoading(true);
    try {
      const response = await fundsAPI.list({
        search: searchValue,
        page: pageNum,
        page_size: pageSize,
      });
      
      const lofFunds = response.data.results.filter(fund => 
        fund.fund_type && (fund.fund_type.includes('LOF') || fund.fund_type.includes('lof'))
      );
      
      setFunds(lofFunds);
      setTotal(response.data.count);
    } catch (error) {
      message.error('加载LOF基金列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadFundDetail = async (fundCode) => {
    setSelectedFund(null);
    setHistoryData([]);
    
    try {
      const [detailRes, marketRes, shareRes, estimateRes] = await Promise.all([
        fundsAPI.detail(fundCode),
        fundsAPI.marketQuote(fundCode).catch(() => null),
        fundsAPI.marketShare(fundCode).catch(() => null),
        fundsAPI.getEstimate(fundCode).catch(() => null)
      ]);

      const fund = detailRes.data;
      if (marketRes?.data) {
        fund.market_price = marketRes.data.market_price;
        fund.market_change = marketRes.data.change;
        fund.market_change_percent = marketRes.data.change_percent;
        fund.close_price = marketRes.data.close_price;
      }
      if (shareRes?.data) {
        fund.market_share = shareRes.data.market_share;
        fund.daily_share_change = shareRes.data.daily_change;
        fund.share_date = shareRes.data.date;
      }
      if (estimateRes?.data) {
        fund.estimate_nav = estimateRes.data.estimate_nav;
        fund.estimate_growth = estimateRes.data.estimate_growth;
      }
      
      setSelectedFund(fund);
      
      // 加载历史数据
      await loadHistoryData(fundCode);
    } catch (error) {
      message.error('加载基金详情失败');
    }
  };

  const loadHistoryData = async (fundCode) => {
    setHistoryLoading(true);
    try {
      const now = new Date();
      const startDate = new Date();
      startDate.setMonth(now.getMonth() - 3);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      
      // 同步历史数据
      try {
        await fundsAPI.syncNavHistory([fundCode], startDateStr, now.toISOString().split('T')[0]);
      } catch (e) {
        console.log('Sync failed, loading existing data');
      }
      
      const response = await fundsAPI.navHistory(fundCode, { start_date: startDateStr });
      const data = response.data.sort((a, b) => new Date(a.nav_date) - new Date(b.nav_date));
      setHistoryData(data);
    } catch (error) {
      message.error('加载历史数据失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadLofFunds();
  }, []);

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
    loadLofFunds(value, 1);
  };

  const handlePageChange = (pageNum) => {
    setPage(pageNum);
    loadLofFunds(search, pageNum);
  };

  const handleViewDetail = (fundCode) => {
    loadFundDetail(fundCode);
  };

  const calculatePremium = (closePrice, nav) => {
    if (!closePrice || !nav) return null;
    const cp = parseFloat(closePrice);
    const nv = parseFloat(nav);
    if (nv === 0) return null;
    return ((cp - nv) / nv) * 100;
  };

  const columns = [
    {
      title: '代码',
      dataIndex: 'fund_code',
      key: 'fund_code',
      width: columnWidths.fund_code,
      responsive: ['sm'],
      resizable: true,
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize('fund_code'),
      }),
    },
    {
      title: '基金名称',
      dataIndex: 'fund_name',
      key: 'fund_name',
      width: columnWidths.fund_name,
      ellipsis: true,
      resizable: true,
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize('fund_name'),
      }),
    },
    {
      title: '收盘价',
      dataIndex: 'close_price',
      key: 'close_price',
      width: columnWidths.close_price,
      responsive: ['sm'],
      resizable: true,
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize('close_price'),
      }),
      render: (price) => {
        if (!price) return '-';
        return <span>¥{parseFloat(price).toFixed(4)}</span>;
      },
    },
    {
      title: (
        <span>
          收盘VST <Tag color="green" style={{ fontSize: '10px', marginLeft: 2 }}>15:00</Tag>
        </span>
      ),
      dataIndex: 'vst_nav',
      key: 'vst_nav',
      width: columnWidths.vst_nav,
      responsive: ['md'],
      resizable: true,
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize('vst_nav'),
      }),
      render: (nav) => {
        if (!nav) return '-';
        return <span>¥{parseFloat(nav).toFixed(4)}</span>;
      },
    },
    {
      title: (
        <span>
          估值净值 <Tag color="orange" style={{ fontSize: '10px', marginLeft: 2 }}>EST</Tag>
        </span>
      ),
      dataIndex: 'estimate_nav',
      key: 'estimate_nav',
      width: columnWidths.estimate_nav,
      responsive: ['md'],
      resizable: true,
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize('estimate_nav'),
      }),
      render: (nav) => {
        if (!nav) return '-';
        return <span>¥{parseFloat(nav).toFixed(4)}</span>;
      },
    },
    {
      title: '单位净值',
      dataIndex: 'latest_nav',
      key: 'unit_nav',
      width: columnWidths.unit_nav,
      responsive: ['sm'],
      resizable: true,
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize('unit_nav'),
      }),
      render: (nav, record) => {
        if (!nav) return '-';
        const date = record.latest_nav_date;
        const dateStr = date ? `(${date.slice(5)})` : '';
        return (
          <span>
            ¥{parseFloat(nav).toFixed(4)}
            <Text type="secondary" style={{ fontSize: '10px', marginLeft: 2 }}>{dateStr}</Text>
          </span>
        );
      },
    },
    {
      title: '溢价率',
      dataIndex: 'fund_code',
      key: 'premium',
      width: columnWidths.premium,
      responsive: ['md'],
      resizable: true,
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize('premium'),
      }),
      render: (code, record) => {
        const premium = calculatePremium(record.close_price, record.latest_nav);
        if (premium === null) return '-';
        const color = premium >= 0 ? '#cf1322' : '#3f8600';
        const prefix = premium >= 0 ? '+' : '';
        return (
          <Text strong style={{ color, fontSize: '12px' }}>
            {prefix}{premium.toFixed(2)}%
          </Text>
        );
      },
    },
    {
      title: '场内份额(万份)',
      dataIndex: 'market_share',
      key: 'market_share',
      width: columnWidths.market_share,
      responsive: ['lg'],
      resizable: true,
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize('market_share'),
      }),
      render: (share) => {
        if (!share) return '-';
        return <span>{parseFloat(share).toLocaleString()}</span>;
      },
    },
    {
      title: '份额变化(万份)',
      dataIndex: 'daily_share_change',
      key: 'daily_share_change',
      width: columnWidths.daily_share_change,
      responsive: ['lg'],
      resizable: true,
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize('daily_share_change'),
      }),
      render: (change) => {
        if (change === null || change === undefined) return '-';
        const numChange = parseFloat(change);
        const color = numChange >= 0 ? '#cf1322' : '#3f8600';
        const prefix = numChange >= 0 ? '+' : '';
        return (
          <Text strong style={{ color, fontSize: '12px' }}>
            {prefix}{numChange.toLocaleString()}
          </Text>
        );
      },
    },
    {
      title: '估值误差',
      dataIndex: 'fund_code',
      key: 'estimate_error',
      width: columnWidths.estimate_error,
      responsive: ['lg'],
      resizable: true,
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize('estimate_error'),
      }),
      render: (code, record) => {
        if (!record.estimate_nav || !record.latest_nav) return '-';
        const est = parseFloat(record.estimate_nav);
        const nav = parseFloat(record.latest_nav);
        if (nav === 0) return '-';
        const error = ((est - nav) / nav) * 100;
        const color = Math.abs(error) < 0.5 ? '#52c41a' : (Math.abs(error) < 1 ? '#faad14' : '#ff4d4f');
        return (
          <Text strong style={{ color, fontSize: '12px' }}>
            {error >= 0 ? '+' : ''}{error.toFixed(2)}%
          </Text>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: columnWidths.action,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record.fund_code)}
        />
      ),
    },
  ];

  const chartOption = useMemo(() => {
    if (!selectedFund || historyData.length === 0) return {};

    const dates = historyData.map(item => item.nav_date);
    const closePrices = historyData.map(item => item.close_price ? parseFloat(item.close_price) : null);
    const vstNavs = historyData.map(item => item.vst_nav ? parseFloat(item.vst_nav) : null);
    const unitNavs = historyData.map(item => parseFloat(item.unit_nav));
    const estimateErrors = historyData.map(item => {
      if (!item.estimate_nav || !item.unit_nav) return null;
      return ((parseFloat(item.estimate_nav) - parseFloat(item.unit_nav)) / parseFloat(item.unit_nav) * 100);
    });

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { 
          type: 'cross',
          crossStyle: { color: '#999' }
        },
        formatter: (params) => {
          let result = `<div style="font-weight:bold;margin-bottom:8px;">${params[0].axisValue}</div>`;
          params.forEach(param => {
            if (param.value !== null && param.value !== undefined) {
              let displayValue = param.value;
              let suffix = '';
              if (param.seriesName === '估值误差') {
                suffix = '%';
                displayValue = param.value.toFixed(2);
              } else {
                displayValue = param.value.toFixed(4);
                suffix = '';
              }
              result += `<div style="display:flex;justify-content:space-between;gap:20px;margin:4px 0;">
                <span>${param.marker}${param.seriesName}:</span>
                <span style="font-weight:bold;">${suffix ? '' : '¥'}${displayValue}${suffix}</span>
              </div>`;
            }
          });
          return result;
        }
      },
      legend: {
        data: ['收盘价', '收盘VST', '单位净值', '估值误差'],
        top: 10
      },
      grid: [
        {
          left: '3%',
          right: '4%',
          bottom: '25%',
          top: '15%',
          containLabel: true
        },
        {
          left: '3%',
          right: '4%',
          bottom: '5%',
          height: '15%',
          containLabel: true
        }
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          axisLabel: {
            rotate: window.innerWidth < 768 ? 45 : 0,
            fontSize: 10
          },
          axisPointer: { type: 'shadow' }
        },
        {
          type: 'category',
          gridIndex: 1,
          data: dates,
          axisLabel: { show: false }
        }
      ],
      yAxis: [
        {
          type: 'value',
          scale: true,
          axisLabel: {
            formatter: (value) => '¥' + value.toFixed(4)
          },
          splitLine: { show: true }
        },
        {
          type: 'value',
          gridIndex: 1,
          axisLabel: {
            formatter: (value) => value.toFixed(2) + '%'
          },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '收盘价',
          type: 'line',
          data: closePrices,
          smooth: true,
          lineStyle: { color: '#1890ff', width: 2 },
          symbol: 'circle',
          symbolSize: 4
        },
        {
          name: '收盘VST',
          type: 'line',
          data: vstNavs,
          smooth: true,
          lineStyle: { color: '#fa8c16', width: 2, type: 'dashed' },
          symbol: 'circle',
          symbolSize: 4
        },
        {
          name: '单位净值',
          type: 'line',
          data: unitNavs,
          smooth: true,
          lineStyle: { color: '#3f8600', width: 2 },
          symbol: 'circle',
          symbolSize: 4
        },
        {
          name: '估值误差',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: estimateErrors,
          itemStyle: {
            color: (params) => {
              const value = params.value;
              if (value === null || value === undefined) return '#ccc';
              return value >= 0 ? '#ef4444' : '#22c55e';
            }
          },
          barWidth: '60%'
        }
      ]
    };
  }, [selectedFund, historyData]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* LOF基金列表 */}
      <Card
        title={
          <span>
            <BarChart3Outlined style={{ marginRight: 8 }} />
            LOF基金列表
          </span>
        }
      >
        <Space style={{ width: '100%', marginBottom: 16 }}>
          <Input.Search
            placeholder="搜索基金名称或代码"
            allowClear
            enterButton={<SearchOutlined />}
            size="large"
            onSearch={handleSearch}
            onChange={(e) => {
              if (!e.target.value) {
                handleSearch('');
              }
            }}
            style={{ width: '100%' }}
          />
        </Space>

        <Table
          columns={columns}
          dataSource={funds}
          rowKey="fund_code"
          loading={loading}
          scroll={{ x: 'max-content' }}
          components={{
            header: {
              cell: ResizableTitle,
            },
          }}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            onChange: handlePageChange,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </Card>

      {/* 基金详情和图表 */}
      {selectedFund && (
        <Card
          title={`${selectedFund.fund_code} - ${selectedFund.fund_name}`}
          extra={
            <Button
              type="primary"
              onClick={() => setSelectedFund(null)}
            >
              返回列表
            </Button>
          }
        >
          {/* 统计数据 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={6} md={4}>
              <Statistic
                title="收盘价"
                value={selectedFund.close_price || '-'}
                precision={selectedFund.close_price ? 4 : 0}
                prefix="¥"
                valueStyle={{ color: '#333' }}
              />
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Statistic
                title="单位净值"
                value={selectedFund.latest_nav || '-'}
                precision={selectedFund.latest_nav ? 4 : 0}
                prefix="¥"
                suffix={selectedFund.latest_nav_date ? ` (${selectedFund.latest_nav_date.slice(5)})` : ''}
                valueStyle={{ color: '#1890ff' }}
              />
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Statistic
                title="估值净值"
                value={selectedFund.estimate_nav || '-'}
                precision={selectedFund.estimate_nav ? 4 : 0}
                prefix="¥"
                valueStyle={{ color: '#fa8c16' }}
              />
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Statistic
                title="溢价率"
                value={calculatePremium(selectedFund.close_price, selectedFund.latest_nav) || '-'}
                precision={calculatePremium(selectedFund.close_price, selectedFund.latest_nav) !== null ? 2 : 0}
                suffix="%"
                valueStyle={{ 
                  color: calculatePremium(selectedFund.close_price, selectedFund.latest_nav) >= 0 ? '#cf1322' : '#3f8600' 
                }}
              />
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Statistic
                title="场内份额(万份)"
                value={selectedFund.market_share || '-'}
                valueStyle={{ color: '#333' }}
              />
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Statistic
                title="份额变化(万份)"
                value={selectedFund.daily_share_change || '-'}
                prefix={selectedFund.daily_share_change > 0 ? '+' : ''}
                valueStyle={{ 
                  color: selectedFund.daily_share_change >= 0 ? '#cf1322' : '#3f8600' 
                }}
              />
            </Col>
          </Row>

          {/* 场内价格涨跌幅 */}
          {selectedFund.market_change !== undefined && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              marginBottom: 24,
              padding: 16,
              backgroundColor: parseFloat(selectedFund.market_change) >= 0 ? 'rgba(207, 19, 34, 0.05)' : 'rgba(63, 134, 0, 0.05)'
            }}>
              <span style={{ marginRight: 12, fontSize: 14, color: '#666' }}>场内价格走势：</span>
              <span style={{ fontSize: 18, fontWeight: 'bold', color: parseFloat(selectedFund.market_change) >= 0 ? '#cf1322' : '#3f8600' }}>
                {parseFloat(selectedFund.market_change) >= 0 ? '+' : ''}{selectedFund.market_change}
              </span>
              <span style={{ marginLeft: 8, fontSize: 16, fontWeight: 'bold', color: parseFloat(selectedFund.market_change) >= 0 ? '#cf1322' : '#3f8600' }}>
                ({parseFloat(selectedFund.market_change_percent) >= 0 ? '+' : ''}{selectedFund.market_change_percent}%)
              </span>
              {parseFloat(selectedFund.market_change) >= 0 ? (
                <TrendingUpOutlined style={{ marginLeft: 8, color: '#cf1322' }} />
              ) : (
                <TrendingDownOutlined style={{ marginLeft: 8, color: '#3f8600' }} />
              )}
            </div>
          )}

          {/* 近3个月历史曲线 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12, color: '#333' }}>
              近3个月净值与估值曲线
            </div>
            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: '50px 0' }}>
                加载中...
              </div>
            ) : historyData.length > 0 ? (
              <ReactECharts
                option={chartOption}
                style={{ height: 400 }}
                opts={{ renderer: 'canvas' }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '50px 0', color: '#999' }}>
                暂无历史数据
              </div>
            )}
          </div>

          {/* 详细数据表格 */}
          {historyData.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12, color: '#333' }}>
                历史估值数据详情
              </div>
              <Table
                dataSource={historyData.slice(-30).reverse()}
                rowKey={(record, index) => index}
                pagination={false}
                scroll={{ x: 'max-content' }}
                columns={[
                  {
                    title: '日期',
                    dataIndex: 'nav_date',
                    key: 'nav_date',
                    width: 100,
                  },
                  {
                    title: '单位净值',
                    dataIndex: 'unit_nav',
                    key: 'unit_nav',
                    width: 120,
                    render: (val) => <span>¥{parseFloat(val).toFixed(4)}</span>
                  },
                  {
                    title: '估值净值',
                    dataIndex: 'estimate_nav',
                    key: 'estimate_nav',
                    width: 120,
                    render: (val) => val ? <span>¥{parseFloat(val).toFixed(4)}</span> : '-'
                  },
                  {
                    title: '日增长率',
                    dataIndex: 'daily_growth',
                    key: 'daily_growth',
                    width: 100,
                    render: (val) => val ? (
                      <span style={{ color: parseFloat(val) >= 0 ? '#cf1322' : '#3f8600' }}>
                        {parseFloat(val) >= 0 ? '+' : ''}{val}%
                      </span>
                    ) : '-'
                  },
                  {
                    title: '估值误差',
                    key: 'estimate_error',
                    width: 100,
                    render: (_, record) => {
                      if (!record.estimate_nav || !record.unit_nav) return '-';
                      const est = parseFloat(record.estimate_nav);
                      const nav = parseFloat(record.unit_nav);
                      const error = ((est - nav) / nav) * 100;
                      const color = Math.abs(error) < 0.5 ? '#52c41a' : (Math.abs(error) < 1 ? '#faad14' : '#ff4d4f');
                      return (
                        <span style={{ color }}>
                          {error >= 0 ? '+' : ''}{error.toFixed(2)}%
                        </span>
                      );
                    }
                  },
                ]}
              />
            </div>
          )}
        </Card>
      )}
    </Space>
  );
};

export default LofFundsPage;