import { useState, useEffect, useMemo, useRef } from 'react';
import { Input, Button, message, Typography, Tag, Pagination, Card, Row, Col, Statistic, Modal } from 'antd';
import { SearchOutlined, EyeOutlined, TrendingUpOutlined, TrendingDownOutlined, BarChart3Outlined, XOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fundsAPI } from '../api';

const { Title, Text } = Typography;

const LofFundsPage = () => {
  const [loading, setLoading] = useState(false);
  const [funds, setFunds] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedFund, setSelectedFund] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const pageSize = 15;

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
      await loadHistoryData(fundCode);
      setModalVisible(true);
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

  const calculateError = (estimateNav, nav) => {
    if (!estimateNav || !nav) return null;
    const en = parseFloat(estimateNav);
    const nv = parseFloat(nav);
    if (nv === 0) return null;
    return ((en - nv) / nv) * 100;
  };

  const mainChartOption = useMemo(() => {
    if (!selectedFund || historyData.length === 0) return {};

    const dates = historyData.map(item => item.nav_date);
    const closePrices = historyData.map(item => item.close_price ? parseFloat(item.close_price) : null);
    const vstNavs = historyData.map(item => item.vst_nav ? parseFloat(item.vst_nav) : null);
    const unitNavs = historyData.map(item => parseFloat(item.unit_nav));
    const premiums = historyData.map(item => {
      if (!item.close_price || !item.unit_nav) return null;
      return calculatePremium(item.close_price, item.unit_nav);
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', crossStyle: { color: '#4d6480' } },
        backgroundColor: 'rgba(15, 22, 35, 0.95)',
        borderColor: '#253550',
        textStyle: { color: '#e2eaf6' },
        formatter: (params) => {
          let result = `<div style="font-weight:bold;margin-bottom:8px;">${params[0].axisValue}</div>`;
          params.forEach(param => {
            if (param.value !== null && param.value !== undefined) {
              let displayValue = param.value;
              let suffix = '';
              if (param.seriesName === '折溢价率') {
                suffix = '%';
                displayValue = param.value.toFixed(2);
              } else {
                displayValue = param.value.toFixed(4);
              }
              result += `<div style="display:flex;justify-content:space-between;gap:20px;margin:4px 0;">
                <span>${param.marker}${param.seriesName}:</span>
                <span style="font-weight:bold;color:#e2eaf6;">${param.seriesName === '折溢价率' ? '' : '¥'}${displayValue}${suffix}</span>
              </div>`;
            }
          });
          return result;
        }
      },
      legend: {
        data: ['场内收盘价', '收盘估值', '公布净值', '折溢价率'],
        top: 10,
        textStyle: { color: '#8fa3c0', fontSize: 12 },
        itemWidth: 14,
        itemHeight: 14
      },
      grid: [
        {
          left: '3%',
          right: '4%',
          bottom: '22%',
          top: '18%',
          containLabel: true
        }
      ],
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#1e2d47' } },
        axisLabel: { color: '#8fa3c0', fontSize: 10, rotate: 45 },
        splitLine: { show: false }
      },
      yAxis: [
        {
          type: 'value',
          scale: true,
          axisLine: { lineStyle: { color: '#1e2d47' } },
          axisLabel: { color: '#8fa3c0', fontSize: 11, formatter: (v) => '¥' + v.toFixed(4) },
          splitLine: { lineStyle: { color: '#1e2d47', type: 'dashed' } }
        },
        {
          type: 'value',
          scale: true,
          position: 'right',
          axisLine: { show: false },
          axisLabel: { color: '#f0a500', fontSize: 11, formatter: (v) => v.toFixed(2) + '%' },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '场内收盘价',
          type: 'line',
          data: closePrices,
          smooth: true,
          lineStyle: { color: '#f0524f', width: 2 },
          symbol: 'circle',
          symbolSize: 5,
          itemStyle: { color: '#f0524f' }
        },
        {
          name: '收盘估值',
          type: 'line',
          data: vstNavs,
          smooth: true,
          lineStyle: { color: '#4d9de0', width: 2, type: 'dashed' },
          symbol: 'circle',
          symbolSize: 5,
          itemStyle: { color: '#4d9de0' }
        },
        {
          name: '公布净值',
          type: 'line',
          data: unitNavs,
          smooth: true,
          lineStyle: { color: '#36b37e', width: 2 },
          symbol: 'circle',
          symbolSize: 5,
          itemStyle: { color: '#36b37e' }
        },
        {
          name: '折溢价率',
          type: 'line',
          yAxisIndex: 1,
          data: premiums,
          smooth: true,
          lineStyle: { color: '#f0a500', width: 1.5 },
          symbol: 'circle',
          symbolSize: 4,
          itemStyle: { color: '#f0a500' }
        }
      ]
    };
  }, [selectedFund, historyData]);

  const premiumChartOption = useMemo(() => {
    if (!selectedFund || historyData.length === 0) return {};

    const dates = historyData.map(item => item.nav_date);
    const premiums = historyData.map(item => {
      if (!item.close_price || !item.unit_nav) return null;
      return calculatePremium(item.close_price, item.unit_nav);
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 22, 35, 0.95)',
        borderColor: '#253550',
        textStyle: { color: '#e2eaf6' },
        formatter: (params) => {
          const val = params[0].value;
          return `<div style="font-weight:bold;margin-bottom:4px;">${params[0].axisValue}</div>
                  <div style="color:${val >= 0 ? '#f0524f' : '#36b37e'}">折溢价率: ${val !== null ? val.toFixed(2) : '--'}%</div>`;
        }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#1e2d47' } },
        axisLabel: { color: '#8fa3c0', fontSize: 10, rotate: 45 },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#1e2d47' } },
        axisLabel: { color: '#8fa3c0', fontSize: 11, formatter: (v) => v.toFixed(2) + '%' },
        splitLine: { lineStyle: { color: '#1e2d47', type: 'dashed' } }
      },
      series: [{
        name: '折溢价率',
        type: 'bar',
        data: premiums.map((val, idx) => ({
          value: val,
          itemStyle: {
            color: val >= 0 ? '#f0524f' : '#36b37e',
            borderRadius: [2, 2, 0, 0]
          }
        })),
        barWidth: '50%'
      }]
    };
  }, [selectedFund, historyData]);

  const errorChartOption = useMemo(() => {
    if (!selectedFund || historyData.length === 0) return {};

    const dates = historyData.map(item => item.nav_date);
    const errors = historyData.map(item => {
      if (!item.vst_nav || !item.unit_nav) return null;
      return calculateError(item.vst_nav, item.unit_nav);
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 22, 35, 0.95)',
        borderColor: '#253550',
        textStyle: { color: '#e2eaf6' },
        formatter: (params) => {
          const val = params[0].value;
          let level = '优';
          let color = '#36b37e';
          if (val !== null) {
            if (Math.abs(val) >= 1) { level = '差'; color = '#f0524f'; }
            else if (Math.abs(val) >= 0.3) { level = '良'; color = '#f0a500'; }
          }
          return `<div style="font-weight:bold;margin-bottom:4px;">${params[0].axisValue}</div>
                  <div style="color:${color}">估值误差: ${val !== null ? val.toFixed(2) : '--'}% (${level})</div>`;
        }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#1e2d47' } },
        axisLabel: { color: '#8fa3c0', fontSize: 10, rotate: 45 },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#1e2d47' } },
        axisLabel: { color: '#8fa3c0', fontSize: 11, formatter: (v) => v.toFixed(2) + '%' },
        splitLine: { lineStyle: { color: '#1e2d47', type: 'dashed' } }
      },
      series: [{
        name: '估值误差',
        type: 'bar',
        data: errors.map((val, idx) => ({
          value: val,
          itemStyle: {
            color: val !== null ? (Math.abs(val) >= 1 ? '#f0524f' : Math.abs(val) >= 0.3 ? '#f0a500' : '#36b37e') : '#4d6480',
            borderRadius: [2, 2, 0, 0]
          }
        })),
        barWidth: '50%'
      }]
    };
  }, [selectedFund, historyData]);

  const metricsGrid = useMemo(() => {
    if (!selectedFund) return null;
    
    const premium = calculatePremium(selectedFund.close_price, selectedFund.latest_nav);
    const error = calculateError(selectedFund.estimate_nav, selectedFund.latest_nav);
    
    return (
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={6}>
          <Card className="metric-card">
            <div className="metric-label">💹 最新净值</div>
            <div className="metric-value">{selectedFund.latest_nav || '--'}</div>
            <div className="metric-sub">单位净值</div>
          </Card>
        </Col>
        <Col xs={6}>
          <Card className="metric-card">
            <div className="metric-label">🏷 场内收盘价</div>
            <div className="metric-value">{selectedFund.close_price || '--'}</div>
            <div className="metric-sub">场内交易价</div>
          </Card>
        </Col>
        <Col xs={6}>
          <Card className="metric-card">
            <div className="metric-label">📊 盘中估值</div>
            <div className="metric-value">{selectedFund.estimate_nav || '--'}</div>
            <div className="metric-sub neu">实时估算</div>
          </Card>
        </Col>
        <Col xs={6}>
          <Card className="metric-card">
            <div className="metric-label">🔔 收盘估值</div>
            <div className="metric-value">{selectedFund.vst_nav || '--'}</div>
            <div className="metric-sub">15:00时点</div>
          </Card>
        </Col>
        <Col xs={6}>
          <Card className={`metric-card ${premium > 0 ? 'hl-p' : premium < 0 ? 'hl-n' : ''}`}>
            <div className="metric-label">📐 折溢价率</div>
            <div className={`metric-value ${premium > 0 ? 'pos' : premium < 0 ? 'neg' : ''}`}>
              {premium !== null ? `${premium > 0 ? '+' : ''}${premium.toFixed(2)}%` : '--'}
            </div>
            <div className="metric-sub">收盘价 vs 净值</div>
          </Card>
        </Col>
        <Col xs={6}>
          <Card className={`metric-card ${error !== null && Math.abs(error) < 0.3 ? 'hl-n' : error !== null && Math.abs(error) >= 1 ? 'hl-p' : ''}`}>
            <div className="metric-label">🎯 估值误差</div>
            <div className={`metric-value ${error !== null && error >= 0 ? 'pos' : error !== null && error < 0 ? 'neg' : ''}`}>
              {error !== null ? `${error >= 0 ? '+' : ''}${error.toFixed(2)}%` : '--'}
            </div>
            <div className="metric-sub neu">&lt;0.3%为优</div>
          </Card>
        </Col>
        <Col xs={6}>
          <Card className="metric-card">
            <div className="metric-label">📈 场内份额</div>
            <div className="metric-value">{selectedFund.market_share ? selectedFund.market_share.toLocaleString() : '--'}</div>
            <div className="metric-sub">万份</div>
          </Card>
        </Col>
        <Col xs={6}>
          <Card className={`metric-card ${selectedFund.daily_share_change > 0 ? 'hl-n' : selectedFund.daily_share_change < 0 ? 'hl-p' : ''}`}>
            <div className="metric-label">🔄 份额变化</div>
            <div className={`metric-value ${selectedFund.daily_share_change > 0 ? 'neg' : selectedFund.daily_share_change < 0 ? 'pos' : ''}`}>
              {selectedFund.daily_share_change ? `${selectedFund.daily_share_change > 0 ? '+' : ''}${selectedFund.daily_share_change.toLocaleString()}` : '--'}
            </div>
            <div className="metric-sub">万份</div>
          </Card>
        </Col>
      </Row>
    );
  }, [selectedFund]);

  return (
    <div className="lof-page">
      <style>{`
        .lof-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0a0e17 0%, #0f1623 100%);
          padding: 20px;
        }
        
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #1e2d47;
        }
        
        .page-title {
          font-size: 20px;
          font-weight: 700;
          color: #e2eaf6;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .search-box {
          background: #141d2e;
          border: 1px solid #253550;
          border-radius: 8px;
          padding: 8px 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .search-box input {
          background: transparent;
          border: none;
          color: #e2eaf6;
          font-size: 13px;
          outline: none;
          width: 200px;
        }
        
        .search-box input::placeholder {
          color: #4d6480;
        }
        
        .fund-table {
          background: #0f1623;
          border: 1px solid #1e2d47;
          border-radius: 12px;
          overflow: hidden;
        }
        
        .table-header {
          background: #141d2e;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #1e2d47;
        }
        
        .table-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .table-title {
          font-size: 13px;
          font-weight: 600;
          color: #e2eaf6;
        }
        
        .table-count {
          font-size: 11px;
          color: #4d6480;
          background: #1e2d47;
          padding: 2px 8px;
          border-radius: 10px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        
        thead th {
          background: #141d2e;
          color: #4d6480;
          font-weight: 600;
          padding: 10px 12px;
          text-align: right;
          white-space: nowrap;
          border-bottom: 1px solid #1e2d47;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        
        thead th:first-child {
          text-align: left;
        }
        
        tbody td {
          padding: 10px 12px;
          border-bottom: 1px solid rgba(30, 45, 71, 0.6);
          text-align: right;
          font-variant-numeric: tabular-nums;
          color: #e2eaf6;
        }
        
        tbody td:first-child {
          text-align: left;
          color: #8fa3c0;
        }
        
        tbody tr:hover td {
          background: rgba(20, 29, 46, 0.8);
        }
        
        tbody tr:last-child td {
          border-bottom: none;
        }
        
        .td-p { color: #f0524f; font-weight: 600; }
        .td-n { color: #36b37e; font-weight: 600; }
        .td-na { color: #4d6480; font-style: italic; }
        
        .btn-view {
          background: #1e6cc8;
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }
        
        .btn-view:hover {
          background: #2a7fd6;
        }
        
        .tag {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 600;
          margin-left: 4px;
        }
        
        .tag-est { background: rgba(240, 165, 0, 0.15); color: #f0a500; }
        .tag-vst { background: rgba(77, 157, 224, 0.15); color: #4d9de0; }
        
        .pagination-wrapper {
          display: flex;
          justify-content: center;
          padding: 16px;
          border-top: 1px solid #1e2d47;
        }
        
        .ant-pagination {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .ant-pagination-item {
          background: #141d2e;
          border: 1px solid #253550;
          border-radius: 6px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #8fa3c0;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .ant-pagination-item:hover {
          border-color: #4d9de0;
          color: #4d9de0;
        }
        
        .ant-pagination-item-active {
          background: #1e6cc8;
          border-color: #1e6cc8;
          color: #fff;
        }
        
        .ant-pagination-prev, .ant-pagination-next {
          background: #141d2e;
          border: 1px solid #253550;
          border-radius: 6px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #8fa3c0;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .ant-pagination-prev:hover, .ant-pagination-next:hover {
          border-color: #4d9de0;
          color: #4d9de0;
        }
        
        .modal-content {
          background: #0f1623;
          border: 1px solid #1e2d47;
          border-radius: 12px;
          max-width: 900px;
          width: 95%;
          max-height: 90vh;
          overflow: hidden;
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          border-bottom: 1px solid #1e2d47;
          background: #141d2e;
        }
        
        .modal-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .modal-title .badge {
          background: #1e6cc8;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
        }
        
        .modal-title-text {
          font-size: 15px;
          font-weight: 700;
          color: #e2eaf6;
        }
        
        .modal-close {
          background: none;
          border: none;
          color: #8fa3c0;
          font-size: 16px;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.15s;
        }
        
        .modal-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #e2eaf6;
        }
        
        .modal-body {
          padding: 16px;
          overflow-y: auto;
          max-height: calc(90vh - 60px);
        }
        
        .metric-card {
          background: #0f1623 !important;
          border: 1px solid #1e2d47 !important;
          border-radius: 12px !important;
          padding: 12px 14px !important;
          transition: all 0.15s;
        }
        
        .metric-card:hover {
          border-color: #253550 !important;
        }
        
        .metric-card.hl-p {
          border-color: rgba(240, 82, 79, 0.35) !important;
          background: rgba(240, 82, 79, 0.05) !important;
        }
        
        .metric-card.hl-n {
          border-color: rgba(54, 179, 126, 0.35) !important;
          background: rgba(54, 179, 126, 0.05) !important;
        }
        
        .metric-label {
          font-size: 10px;
          color: #4d6480;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 5px;
        }
        
        .metric-value {
          font-size: 20px;
          font-weight: 700;
          color: #e2eaf6;
          font-variant-numeric: tabular-nums;
          line-height: 1.1;
        }
        
        .metric-value.pos { color: #f0524f; }
        .metric-value.neg { color: #36b37e; }
        
        .metric-sub {
          font-size: 11px;
          margin-top: 3px;
          color: #8fa3c0;
        }
        
        .metric-sub.neu { color: #4d6480; }
        
        .chart-card {
          background: #0f1623;
          border: 1px solid #1e2d47;
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 14px;
        }
        
        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .chart-title {
          font-size: 13px;
          font-weight: 600;
          color: #e2eaf6;
        }
        
        .chart-subtitle {
          font-size: 10px;
          color: #4d6480;
          margin-top: 2px;
        }
        
        .chart-legend {
          display: flex;
          gap: 14px;
          font-size: 10px;
          color: #8fa3c0;
        }
        
        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 4px;
        }
        
        .legend-line {
          width: 14px;
          height: 2px;
          display: inline-block;
          margin-right: 4px;
          vertical-align: middle;
        }
        
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }
        
        .info-card {
          background: #0f1623;
          border: 1px solid #1e2d47;
          border-radius: 12px;
          padding: 14px;
        }
        
        .info-card-title {
          font-size: 10px;
          color: #4d6480;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          margin-bottom: 10px;
          border-bottom: 1px solid #1e2d47;
          padding-bottom: 7px;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          font-size: 12px;
        }
        
        .info-key { color: #8fa3c0; }
        .info-value { color: #e2eaf6; font-weight: 500; text-align: right; }
        
        .loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(10, 14, 23, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }
        
        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #4d9de0;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #4d6480;
        }
        
        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }
        
        .empty-state-title {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #8fa3c0;
        }
        
        .empty-state-desc {
          font-size: 13px;
          line-height: 1.6;
        }
      `}</style>

      <div className="page-header">
        <div className="page-title">
          <BarChart3Outlined style={{ color: '#4d9de0' }} />
          LOF基金全景
        </div>
        <div className="search-box">
          <SearchOutlined style={{ color: '#4d6480' }} />
          <input
            type="text"
            placeholder="搜索基金代码或名称"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="fund-table">
        <div className="table-header">
          <div className="table-header-left">
            <div className="table-title">LOF基金列表</div>
            <div className="table-count">{total} 只</div>
          </div>
        </div>

        {loading ? (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
          </div>
        ) : funds.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-title">暂无LOF基金数据</div>
            <div className="empty-state-desc">请检查网络连接或稍后重试</div>
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '10%' }}>代码</th>
                  <th style={{ width: '18%' }}>基金名称</th>
                  <th style={{ width: '10%' }}>收盘价</th>
                  <th style={{ width: '10%' }}>收盘VST <span className="tag tag-vst">15:00</span></th>
                  <th style={{ width: '10%' }}>估值净值 <span className="tag tag-est">EST</span></th>
                  <th style={{ width: '10%' }}>单位净值</th>
                  <th style={{ width: '8%' }}>折溢价率</th>
                  <th style={{ width: '10%' }}>场内份额(万份)</th>
                  <th style={{ width: '10%' }}>份额变化</th>
                  <th style={{ width: '4%' }}></th>
                </tr>
              </thead>
              <tbody>
                {funds.map((fund) => {
                  const premium = calculatePremium(fund.close_price, fund.latest_nav);
                  return (
                    <tr key={fund.fund_code}>
                      <td style={{ fontWeight: 600 }}>{fund.fund_code}</td>
                      <td>{fund.fund_name}</td>
                      <td>¥{fund.close_price || '--'}</td>
                      <td>¥{fund.vst_nav || '--'}</td>
                      <td>¥{fund.estimate_nav || '--'}</td>
                      <td>¥{fund.latest_nav || '--'}</td>
                      <td className={premium > 0 ? 'td-p' : premium < 0 ? 'td-n' : 'td-na'}>
                        {premium !== null ? `${premium > 0 ? '+' : ''}${premium.toFixed(2)}%` : '--'}
                      </td>
                      <td>{fund.market_share ? fund.market_share.toLocaleString() : '--'}</td>
                      <td className={fund.daily_share_change > 0 ? 'td-n' : fund.daily_share_change < 0 ? 'td-p' : 'td-na'}>
                        {fund.daily_share_change ? `${fund.daily_share_change > 0 ? '+' : ''}${fund.daily_share_change.toLocaleString()}` : '--'}
                      </td>
                      <td>
                        <button className="btn-view" onClick={() => handleViewDetail(fund.fund_code)}>
                          <EyeOutlined style={{ fontSize: 12 }} />
                          查看
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="pagination-wrapper">
              <Pagination
                current={page}
                total={total}
                pageSize={pageSize}
                onChange={handlePageChange}
                showSizeChanger={false}
              />
            </div>
          </>
        )}
      </div>

      <Modal
        visible={modalVisible}
        footer={null}
        closable={false}
        maskStyle={{ background: 'rgba(0, 0, 0, 0.7)' }}
        wrapClassName="modal-wrapper"
      >
        <div className="modal-content">
          <div className="modal-header">
            <div className="modal-title">
              <span className="badge">{selectedFund?.fund_code}</span>
              <span className="modal-title-text">{selectedFund?.fund_name}</span>
            </div>
            <button className="modal-close" onClick={() => setModalVisible(false)}>
              <XOutlined />
            </button>
          </div>
          
          <div className="modal-body">
            {historyLoading ? (
              <div className="loading-overlay">
                <div className="loading-spinner"></div>
              </div>
            ) : (
              <>
                {metricsGrid}

                <div className="chart-card">
                  <div className="chart-header">
                    <div>
                      <div className="chart-title">收盘价 / 净值 / 收盘估值 三线对比</div>
                      <div className="chart-subtitle">核心分析曲线 · 三线贴合度反映估值准确性</div>
                    </div>
                    <div className="chart-legend">
                      <span><span className="legend-dot" style={{ background: '#f0524f' }}></span>场内收盘价</span>
                      <span><span className="legend-dot" style={{ background: '#4d9de0' }}></span>收盘估值</span>
                      <span><span className="legend-dot" style={{ background: '#36b37e' }}></span>公布净值</span>
                      <span><span className="legend-dot" style={{ background: '#f0a500' }}></span>折溢价率</span>
                    </div>
                  </div>
                  <div style={{ height: 260 }}>
                    <ReactECharts option={mainChartOption} style={{ height: '100%' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="chart-card">
                    <div className="chart-header">
                      <div className="chart-title">折溢价率走势</div>
                    </div>
                    <div style={{ height: 160 }}>
                      <ReactECharts option={premiumChartOption} style={{ height: '100%' }} />
                    </div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-header">
                      <div className="chart-title">收盘估值误差率</div>
                      <div style={{ fontSize: 10, color: '#4d6480' }}>越小越准确</div>
                    </div>
                    <div style={{ height: 160 }}>
                      <ReactECharts option={errorChartOption} style={{ height: '100%' }} />
                    </div>
                  </div>
                </div>

                <div className="info-grid">
                  <div className="info-card">
                    <div className="info-card-title">基金基本信息</div>
                    <div className="info-row"><span className="info-key">基金代码</span><span className="info-value">{selectedFund?.fund_code}</span></div>
                    <div className="info-row"><span className="info-key">基金类型</span><span className="info-value">{selectedFund?.fund_type}</span></div>
                    <div className="info-row"><span className="info-key">最新净值</span><span className="info-value">¥{selectedFund?.latest_nav}</span></div>
                    <div className="info-row"><span className="info-key">净值日期</span><span className="info-value">{selectedFund?.latest_nav_date}</span></div>
                  </div>
                  <div className="info-card">
                    <div className="info-card-title">场内交易信息</div>
                    <div className="info-row"><span className="info-key">收盘价</span><span className="info-value">¥{selectedFund?.close_price}</span></div>
                    <div className="info-row"><span className="info-key">场内份额</span><span className="info-value">{selectedFund?.market_share?.toLocaleString()} 万份</span></div>
                    <div className="info-row"><span className="info-key">份额变化</span><span className="info-value" style={{ color: selectedFund?.daily_share_change > 0 ? '#36b37e' : selectedFund?.daily_share_change < 0 ? '#f0524f' : '#8fa3c0' }}>
                      {selectedFund?.daily_share_change ? `${selectedFund.daily_share_change > 0 ? '+' : ''}${selectedFund.daily_share_change.toLocaleString()}` : '--'} 万份
                    </span></div>
                    <div className="info-row"><span className="info-key">折溢价率</span><span className="info-value" style={{ color: premium > 0 ? '#f0524f' : premium < 0 ? '#36b37e' : '#8fa3c0' }}>
                      {premium !== null ? `${premium > 0 ? '+' : ''}${premium.toFixed(2)}%` : '--'}
                    </span></div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LofFundsPage;
