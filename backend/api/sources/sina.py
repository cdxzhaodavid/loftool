import requests
import re
import logging
from decimal import Decimal
from datetime import datetime, date, timedelta
from typing import Optional, Dict, List

from .base import BaseEstimateSource

logger = logging.getLogger(__name__)

class SinaStockSource(BaseEstimateSource):
    """新浪财经股票/ETF实时行情"""
    
    BASE_URL = 'http://hq.sinajs.cn/list={symbol}'
    INTRADAY_URL = 'http://market.finance.sina.com.cn/downxls.php?date={date}&symbol={symbol}'
    
    def get_source_name(self) -> str:
        return 'sina'

    def fetch_estimate(self, fund_code: str) -> Optional[Dict]:
        """实现 BaseEstimateSource 接口，虽然它主要用于场外估值，但我们也可以统一返回"""
        return self.fetch_market_quote(fund_code)

    def fetch_realtime_nav(self, fund_code: str) -> Optional[Dict]:
        return None

    def fetch_today_nav(self, fund_code: str) -> Optional[Dict]:
        """sina 源不支持确权净值查询，仅支持实时行情"""
        return None

    def get_login_type(self) -> str:
        return 'none'

    def fetch_fund_list(self) -> list:
        return []

    def fetch_nav_history(self, fund_code: str, start_date=None, end_date=None) -> List[Dict]:
        return []

    def fetch_market_quote(self, fund_code: str) -> Optional[Dict]:
        """
        获取场内实时价格
        
        返回格式:
        var hq_str_sh511520="富国中债7-10年期国债ETF,115.630,115.635,115.660,115.680,115.580,115.660,115.670,1402200,162158860,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-02-27,15:00:00,00,0";
        """
        try:
            # 判断市场：上海 50/51/52/56/58/6x，深圳 15/16/18/其他
            if fund_code.startswith(('50', '51', '52', '56', '58')):
                symbol_prefix = 'sh'
            elif fund_code.startswith(('15', '16', '18')):
                symbol_prefix = 'sz'
            else:
                # 兜底：6 开头上海，其他深圳
                symbol_prefix = 'sh' if fund_code.startswith('6') else 'sz'
            symbol = f'{symbol_prefix}{fund_code}'
                
            headers = {
                'Referer': 'http://finance.sina.com.cn'
            }
            url = self.BASE_URL.format(symbol=symbol)
            response = requests.get(url, headers=headers, timeout=10)
            response.encoding = 'gbk'
            
            text = response.text
            match = re.search(r'"(.*)"', text)
            if not match or not match.group(1):
                return None
                
            parts = match.group(1).split(',')
            if len(parts) < 32:
                return None
                
            current_price = Decimal(parts[3])
            prev_close = Decimal(parts[2])
            
            if current_price == 0:
                current_price = prev_close
                
            growth = Decimal(0)
            if prev_close > 0:
                growth = ((current_price - prev_close) / prev_close) * 100
                
            return {
                'fund_code': fund_code,
                'market_price': current_price,
                'market_growth': growth,
                'market_time': f"{parts[30]} {parts[31]}",
                'symbol': symbol
            }
        except Exception as e:
            logger.error(f"Sina fetch error for {fund_code}: {e}")
            return None

    def fetch_intraday_data(self, fund_code: str, query_date: str = None) -> Optional[Dict]:
        """
        获取分时数据（支持盘后访问历史数据）
        
        Args:
            fund_code: 基金代码
            query_date: 查询日期，格式 YYYY-MM-DD，不传则获取当日数据
        
        Returns:
            dict: {
                'fund_code': str,
                'date': str,
                'times': list,     # 时间列表 ['09:30', '09:31', ...]
                'prices': list,    # 价格列表
                'volumes': list,   # 成交量列表（手）
                'amounts': list,   # 成交额列表（元）
                'avg_prices': list # 均价列表
            }
        """
        try:
            # 判断市场：上海 50/51/52/56/58/6x，深圳 15/16/18/其他
            if fund_code.startswith(('50', '51', '52', '56', '58')):
                symbol_prefix = 'sh'
            elif fund_code.startswith(('15', '16', '18')):
                symbol_prefix = 'sz'
            else:
                symbol_prefix = 'sh' if fund_code.startswith('6') else 'sz'
            symbol = f'{symbol_prefix}{fund_code}'
            
            # 默认使用当日日期
            if not query_date:
                query_date = date.today().strftime('%Y-%m-%d')
            
            headers = {
                'Referer': 'http://finance.sina.com.cn',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            url = self.INTRADAY_URL.format(date=query_date, symbol=symbol)
            response = requests.get(url, headers=headers, timeout=15)
            response.encoding = 'gbk'
            
            text = response.text
            if not text or text.startswith('<html') or 'error' in text.lower():
                logger.warning(f"Intraday data not available for {fund_code} on {query_date}")
                return None
            
            lines = text.strip().split('\n')
            if len(lines) < 2:
                return None
            
            # 解析表头
            headers_line = lines[0]
            headers = [h.strip() for h in headers_line.split('\t')]
            
            times = []
            prices = []
            volumes = []
            amounts = []
            avg_prices = []
            
            # 解析数据行
            for line in lines[1:]:
                if not line.strip():
                    continue
                parts = line.split('\t')
                if len(parts) >= 5:
                    time_str = parts[0].strip()
                    try:
                        price = Decimal(parts[1].strip())
                        volume = int(parts[2].strip())
                        amount = Decimal(parts[3].strip())
                        avg_price = Decimal(parts[4].strip())
                        
                        times.append(time_str)
                        prices.append(price)
                        volumes.append(volume)
                        amounts.append(amount)
                        avg_prices.append(avg_price)
                    except (ValueError, IndexError) as e:
                        logger.debug(f"Skipping invalid line: {line}")
                        continue
            
            if not times:
                return None
            
            return {
                'fund_code': fund_code,
                'date': query_date,
                'times': times,
                'prices': [str(p) for p in prices],
                'volumes': volumes,
                'amounts': [str(a) for a in amounts],
                'avg_prices': [str(p) for p in avg_prices],
                'symbol': symbol
            }
            
        except requests.RequestException as e:
            logger.error(f"Sina intraday fetch network error for {fund_code}: {e}")
            return None
        except Exception as e:
            logger.error(f"Sina intraday fetch error for {fund_code}: {e}")
            return None
