import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { v4 as uuidv4 } from 'uuid';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly appId = 'wx7a48de22423333c3';
  private readonly secret = '5306eb0f85490248e2f39e51dbbd6de3';

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly httpService: HttpService,
  ) {}

  private async getAccessToken() {
    const APPID_CACHE_KEY = `${this.appId}:token`;
    // 读取缓存
    let accessToken: string | null =
      await this.cacheManager.get(APPID_CACHE_KEY);
    if (!accessToken) {
      // 获取access_token GET https://api.weixin.qq.com/cgi-bin/token
      const { status, data } = await this.httpService
        .get('https://api.weixin.qq.com/cgi-bin/token', {
          params: {
            grant_type: 'client_credential',
            appid: this.appId,
            secret: this.secret,
          },
        })
        .toPromise();
      if (status === 200 && data?.access_token) {
        await this.cacheManager.set(
          APPID_CACHE_KEY,
          data.access_token,
          (data.expires_in - 60) * 1e3,
        );
      }
      // 抛出异常
      if (data?.errcode) {
        throw new BadRequestException(`[${data?.errcode}] ${data?.errmsg}`);
      }
      accessToken = data?.access_token;
    }
    this.logger.debug('accessToken', accessToken);
    return accessToken;
  }

  /**
   * 获取码状态
   * @param scene
   * @returns
   */
  async getCodeStatus(scene: string) {
    const APPID_CACHE_KEY = `${this.appId}:scene`;
    // 这里不多做了，直接读取缓存数据吧
    return await this.cacheManager.get(APPID_CACHE_KEY + `${scene}`);
  }

  /**
   *
   * @param scene
   * @param { code }
   * @returns
   */
  async appletLogin(scene: string, { code }) {
    // GET https://api.weixin.qq.com/sns/jscode2session
    const accessToken = await this.getAccessToken();
    const { data } = await this.httpService
      .get(
        `https://api.weixin.qq.com/sns/jscode2session?access_token=${accessToken}`,
        {
          params: {
            appid: this.appId,
            secret: this.secret,
            js_code: code,
            grant_type: 'authorization_code',
          },
        },
      )
      .toPromise();
    // 获取缓存
    const APPID_CACHE_KEY = `${this.appId}:scene`;
    const qrStatus = await this.getCodeStatus(scene);
    if (qrStatus) {
      // 更新扫码状态，标记登录成功
      await this.cacheManager.set(
        APPID_CACHE_KEY + `${scene}`,
        {
          status: 2,
          // TODO 写入token等数据
          ...data,
        },
        5 * 60 * 1e3,
      );
    }
    return data;
  }

  /**
   * 获取小程序二维码
   * @returns
   */
  async getQrCode() {
    const APPID_CACHE_KEY = `${this.appId}:scene`;
    // 构建二维码数据
    const accessToken = await this.getAccessToken();
    // POST https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=ACCESS_TOKEN

    const { headers, data } = await this.httpService
      .post(
        `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
        {
          page: '',
          scene: 'a=1',
        },
        {
          responseType: 'arraybuffer',
        },
      )
      .toPromise();
    // 截取请求响应类型，是错误还是成功
    const contentType = headers['content-type'];
    if (contentType.includes('application/json')) {
      throw new BadRequestException(`[${data?.errcode}] ${data?.errmsg}`);
    } else {
      const scene = uuidv4();
      // 记录缓存等待扫码
      await this.cacheManager.set(
        APPID_CACHE_KEY + `${scene}`,
        {
          status: 0, // 0 等待 1 扫码 2 登录
        },
        5 * 60 * 1e3,
      );
      this.logger.debug('scene', scene);
      return {
        scene,
        qrcode: `data:image/png;base64,${Buffer.from(data as string).toString('base64')}`,
      };
    }
  }
}
