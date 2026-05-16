import { useState, useEffect } from 'react';
import { Card, Table, Input, Button, Space, message, Tag, Statistic, Row, Col, Spin } from 'antd';
import { DatabaseOutlined, TableOutlined, SearchOutlined, RefreshOutlined, ChevronRightOutlined } from '@ant-design/icons';
import { api } from '../api/axios';

const DataBrowserPage = () => {
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({});

  const pageSize = 20;

  const loadTables = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/database/tables/');
      setTables(response.data);
    } catch (error) {
      message.error('加载表列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const response = await api.get('/admin/database/summary/');
      setSummary(response.data);
    } catch (error) {
      console.error('加载摘要失败:', error);
    }
  };

  const loadTableData = async (tableName, pageNum = 1, searchValue = '') => {
    setLoading(true);
    try {
      const response = await api.get(`/admin/database/tables/${tableName}/`, {
        params: {
          page: pageNum,
          page_size: pageSize,
          search: searchValue,
        },
      });
      setTableData(response.data.results);
      setColumns(response.data.columns || []);
      setTotal(response.data.count || 0);
      setPage(pageNum);
      setSearch(searchValue);
    } catch (error) {
      message.error('加载表数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTable = (tableName) => {
    setSelectedTable(tableName);
    setSearch('');
    loadTableData(tableName, 1, '');
  };

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
    if (selectedTable) {
      loadTableData(selectedTable, 1, value);
    }
  };

  const handlePageChange = (pageNum) => {
    if (selectedTable) {
      loadTableData(selectedTable, pageNum, search);
    }
  };

  const handleBack = () => {
    setSelectedTable(null);
    setTableData([]);
    setColumns([]);
  };

  useEffect(() => {
    loadTables();
    loadSummary();
  }, []);

  const tableColumns = columns.map((col) => ({
    title: col,
    dataIndex: col,
    key: col,
    ellipsis: true,
    width: Math.min(200, Math.max(80, 600 / columns.length)),
    render: (text) => {
      if (text === null) {
        return <Tag color="gray">NULL</Tag>;
      }
      if (typeof text === 'boolean') {
        return text ? <Tag color="green">True</Tag> : <Tag color="red">False</Tag>;
      }
      if (typeof text === 'number' && text.toString().length > 15) {
        return text.toString().slice(0, 15) + '...';
      }
      if (typeof text === 'string' && text.length > 50) {
        return text.slice(0, 50) + '...';
      }
      return text;
    },
  }));

  if (selectedTable) {
    return (
      <Card
        title={selectedTable}
        extra={
          <Space>
            <Button type="link" onClick={handleBack} icon={<ChevronRightOutlined />} style={{ transform: 'rotate(180deg)' }}>
              返回表列表
            </Button>
          </Space>
        }
      >
        <Space style={{ width: '100%', marginBottom: 16 }}>
          <Input.Search
            placeholder="搜索数据"
            allowClear
            enterButton={<SearchOutlined />}
            size="large"
            onSearch={handleSearch}
            value={search}
            onChange={(e) => {
              if (!e.target.value) {
                handleSearch('');
              }
            }}
            style={{ width: '100%' }}
          />
        </Space>

        <Table
          columns={tableColumns}
          dataSource={tableData}
          rowKey={(record, index) => index}
          loading={loading}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            onChange: handlePageChange,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title="数据库统计">
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Statistic title="基金数量" value={summary.funds || 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="账户数量" value={summary.accounts || 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="持仓数量" value={summary.positions || 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="净值记录" value={summary.nav_history || 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="估值记录" value={summary.estimate_accuracy || 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="操作记录" value={summary.operations || 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="自选列表" value={summary.watchlists || 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="用户数量" value={summary.users || 0} />
          </Col>
        </Row>
      </Card>

      <Card
        title="数据表列表"
        extra={
          <Button icon={<RefreshOutlined />} onClick={loadTables} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table
          columns={[
            {
              title: '表名',
              dataIndex: 'name',
              key: 'name',
              icon: <TableOutlined />,
              render: (name, record) => (
                <Button
                  type="link"
                  onClick={() => handleSelectTable(name)}
                  icon={<ChevronRightOutlined />}
                >
                  {name}
                </Button>
              ),
            },
            {
              title: '字段数',
              dataIndex: 'columns',
              key: 'columns',
              render: (cols) => cols.length,
            },
            {
              title: '记录数',
              dataIndex: 'count',
              key: 'count',
              render: (count) => (
                <Tag color={count > 0 ? 'green' : 'gray'}>{count}</Tag>
              ),
            },
            {
              title: '字段列表',
              dataIndex: 'columns',
              key: 'columns_list',
              ellipsis: true,
              render: (cols) => cols.map((c) => c.name).join(', '),
            },
          ]}
          dataSource={tables}
          rowKey="name"
          loading={loading}
          pagination={false}
        />
      </Card>
    </Space>
  );
};

export default DataBrowserPage;