"""
API 视图
"""
import json
import logging
from django.http import JsonResponse
from django.db import connection
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.status import (
    HTTP_200_OK, HTTP_201_CREATED, HTTP_400_BAD_REQUEST,
    HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN, HTTP_404_NOT_FOUND
)
from rest_framework_simplejwt.tokens import RefreshToken
from .models import (
    Fund, Account, Position, PositionOperation,
    Watchlist, WatchlistItem, EstimateAccuracy, FundNavHistory,
    UserPreference, AIConfig, AIPromptTemplate,
    NotificationChannel, NotificationRule, NotificationLog,
)
from .serializers import (
    UserRegisterSerializer, UserPreferenceSerializer, AIConfigSerializer,
    AIPromptTemplateSerializer, NotificationChannelSerializer,
    NotificationRuleSerializer, NotificationLogSerializer,
)
from fundval.config import config
from fundval.bootstrap import bootstrap, verify_key

logger = logging.getLogger(__name__)


# === 健康检查 ===
@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    """健康检查"""
    return Response({'status': 'ok'})


# === Bootstrap 初始化 ===
@api_view(['POST'])
@permission_classes([AllowAny])
def bootstrap_verify(request):
    """验证初始化密钥"""
    bootstrap_key = request.data.get('bootstrap_key')
    if not bootstrap_key:
        return Response({'error': '缺少 bootstrap_key 参数'}, status=HTTP_400_BAD_REQUEST)
    
    if verify_key(bootstrap_key):
        return Response({'valid': True})
    return Response({'valid': False}, status=HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
@permission_classes([AllowAny])
def bootstrap_initialize(request):
    """初始化系统"""
    bootstrap_key = request.data.get('bootstrap_key')
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not bootstrap_key or not username or not password:
        return Response({'error': '缺少必要参数'}, status=HTTP_400_BAD_REQUEST)
    
    if not verify_key(bootstrap_key):
        return Response({'error': '无效的初始化密钥'}, status=HTTP_401_UNAUTHORIZED)
    
    try:
        result = bootstrap(username, password)
        return Response(result, status=HTTP_201_CREATED)
    except Exception as e:
        logger.error(f'初始化失败: {e}')
        return Response({'error': str(e)}, status=HTTP_400_BAD_REQUEST)


# === 认证 ===
@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """用户登录"""
    username = request.data.get('username')
    password = request.data.get('password')
    
    user = authenticate(username=username, password=password)
    if not user:
        return Response({'error': '用户名或密码错误'}, status=HTTP_401_UNAUTHORIZED)
    
    refresh = RefreshToken.for_user(user)
    return Response({
        'access_token': str(refresh.access_token),
        'refresh_token': str(refresh),
        'user': {
            'id': str(user.id),
            'username': user.username,
            'is_staff': user.is_staff,
        }
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_token(request):
    """刷新 Token"""
    refresh_token = request.data.get('refresh_token')
    if not refresh_token:
        return Response({'error': '缺少 refresh_token'}, status=HTTP_400_BAD_REQUEST)
    
    try:
        refresh = RefreshToken(refresh_token)
        return Response({
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
        })
    except Exception as e:
        return Response({'error': '无效的 refresh_token'}, status=HTTP_401_UNAUTHORIZED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """获取当前用户信息"""
    user = request.user
    return Response({
        'id': str(user.id),
        'username': user.username,
        'is_staff': user.is_staff,
    })


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def change_password(request):
    """修改密码"""
    user = request.user
    old_password = request.data.get('old_password')
    new_password = request.data.get('new_password')
    
    if not old_password or not new_password:
        return Response({'error': '缺少密码参数'}, status=HTTP_400_BAD_REQUEST)
    
    if not user.check_password(old_password):
        return Response({'error': '旧密码错误'}, status=HTTP_400_BAD_REQUEST)
    
    user.set_password(new_password)
    user.save()
    return Response({'success': True})


# === AI 分析 ===
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ai_analyze(request):
    """AI 分析接口"""
    template_id = request.data.get('template_id')
    context_type = request.data.get('context_type')
    context_data = request.data.get('context_data', {})
    
    if not context_type:
        return Response({'error': '缺少 context_type 参数'}, status=HTTP_400_BAD_REQUEST)
    
    # 获取 AI 配置
    ai_config = AIConfig.objects.filter(user=request.user).first()
    if not ai_config:
        return Response({'error': '请先配置 AI 参数'}, status=HTTP_400_BAD_REQUEST)
    
    # 获取提示词模板
    if template_id:
        template = AIPromptTemplate.objects.filter(id=template_id, user=request.user).first()
        if not template:
            return Response({'error': '模板不存在'}, status=HTTP_404_NOT_FOUND)
    else:
        # 使用默认模板
        template = AIPromptTemplate.objects.filter(
            user=request.user,
            context_type=context_type,
            is_default=True
        ).first()
    
    try:
        import openai
        
        client = openai.OpenAI(
            api_key=ai_config.api_key,
            base_url=ai_config.api_endpoint
        )
        
        # 构建提示词
        system_prompt = template.system_prompt if template else ''
        user_prompt = template.user_prompt if template else ''
        
        # 替换占位符
        for key, value in context_data.items():
            user_prompt = user_prompt.replace(f'{{{key}}}', str(value) if value else '')
        
        # 调用 AI
        response = client.chat.completions.create(
            model=ai_config.model_name,
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt}
            ],
            timeout=120
        )
        
        return Response({
            'result': response.choices[0].message.content,
            'model': ai_config.model_name,
        })
    
    except Exception as e:
        logger.error(f'AI 分析失败: {e}')
        return Response({'error': str(e)}, status=HTTP_500_INTERNAL_SERVER_ERROR)


# === 数据库浏览 API ===
@api_view(['GET'])
@permission_classes([IsAdminUser])
def database_tables(request):
    """获取数据库所有表信息"""
    tables = []
    
    with connection.cursor() as cursor:
        # 获取所有表名
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        table_names = [row[0] for row in cursor.fetchall()]
        
        for table_name in table_names:
            # 获取表字段信息
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = []
            for col in cursor.fetchall():
                columns.append({
                    'name': col[1],
                    'type': col[2],
                    'not_null': bool(col[3]),
                    'pk': bool(col[5]),
                })
            
            # 获取记录数
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            
            tables.append({
                'name': table_name,
                'columns': columns,
                'count': count,
            })
    
    return Response(tables)


@api_view(['GET'])
@permission_classes([IsAdminUser])
def table_data(request, table_name):
    """获取指定表的数据"""
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('page_size', 20))
    search = request.query_params.get('search', '')
    
    offset = (page - 1) * page_size
    
    try:
        with connection.cursor() as cursor:
            # 获取字段名
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [col[1] for col in cursor.fetchall()]
            
            # 构建查询
            if search:
                # 简单的模糊搜索（只搜索字符串字段）
                search_conditions = " OR ".join([f"{col} LIKE ?" for col in columns])
                query = f"SELECT * FROM {table_name} WHERE {search_conditions} LIMIT ? OFFSET ?"
                params = [f'%{search}%'] * len(columns) + [page_size, offset]
            else:
                query = f"SELECT * FROM {table_name} LIMIT ? OFFSET ?"
                params = [page_size, offset]
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            # 转换为字典列表
            data = []
            for row in rows:
                row_dict = {}
                for i, col in enumerate(columns):
                    # 处理二进制数据
                    if isinstance(row[i], bytes):
                        try:
                            row_dict[col] = row[i].decode('utf-8')
                        except:
                            row_dict[col] = f"[BINARY: {len(row[i])} bytes]"
                    elif row[i] is None:
                        row_dict[col] = None
                    else:
                        row_dict[col] = row[i]
                data.append(row_dict)
            
            # 获取总数
            if search:
                count_query = f"SELECT COUNT(*) FROM {table_name} WHERE {search_conditions}"
                cursor.execute(count_query, [f'%{search}%'] * len(columns))
            else:
                count_query = f"SELECT COUNT(*) FROM {table_name}"
                cursor.execute(count_query)
            total = cursor.fetchone()[0]
            
            return Response({
                'table_name': table_name,
                'columns': columns,
                'count': total,
                'page': page,
                'page_size': page_size,
                'results': data,
            })
    
    except Exception as e:
        return Response({'error': str(e)}, status=HTTP_500_INTERNAL_SERVER_ERROR)


# === 快捷统计 ===
@api_view(['GET'])
@permission_classes([IsAdminUser])
def database_summary(request):
    """获取数据库摘要统计"""
    summary = {
        'funds': Fund.objects.count(),
        'accounts': Account.objects.count(),
        'positions': Position.objects.count(),
        'operations': PositionOperation.objects.count(),
        'watchlists': Watchlist.objects.count(),
        'watchlist_items': WatchlistItem.objects.count(),
        'estimate_accuracy': EstimateAccuracy.objects.count(),
        'nav_history': FundNavHistory.objects.count(),
        'users': User.objects.count(),
    }
    return Response(summary)