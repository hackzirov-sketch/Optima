import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';

const durationSeconds = (value: string) => {
  const match = value.match(/^P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/);
  return match ? Math.round(Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0)) : 0;
};

@Injectable()
export class EducationSyncService {
  private readonly key: string;
  constructor(private readonly db: DatabaseService, config: ConfigService) { this.key = config.get<string>('YOUTUBE_API_KEY')?.trim() || ''; }

  async resolveChannel(source: string, userId: string) {
    await this.assertAdmin(userId); this.assertConfigured();
    const input = String(source || '').trim(); if (!input) throw new BadRequestException('Channel URL, ID yoki handle kiriting');
    const channelId = input.match(/(?:channel\/)?(UC[\w-]{20,})/)?.[1];
    const handle = input.match(/@([\w.-]+)/)?.[1] || (input.startsWith('@') ? input.slice(1) : '');
    if (!channelId && !handle) throw new BadRequestException('Faqat channel ID, URL yoki handle qabul qilinadi');
    const params = new URLSearchParams({ part: 'snippet,contentDetails', key: this.key });
    if (channelId) params.set('id', channelId); else params.set('forHandle', handle);
    const payload = await this.youtube(`channels?${params}`); const item = payload.items?.[0]; if (!item) throw new BadRequestException('YouTube kanali topilmadi');
    return { youtubeChannelId: item.id, name: item.snippet.title, handle: item.snippet.customUrl || null, description: item.snippet.description, avatarUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url, uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads };
  }

  async addPlaylist(body: Record<string, unknown>, userId: string) {
    await this.assertAdmin(userId); this.assertConfigured();
    const channelId=String(body.channelId||''); const playlistId=this.playlistId(String(body.youtubePlaylistId||body.source||''));
    const channels=await this.db.query(`SELECT id FROM education_channels WHERE id=$1 AND is_verified AND is_active`,[channelId]); if(!channels[0]) throw new BadRequestException('Avval kanalni tasdiqlang');
    const params=new URLSearchParams({part:'snippet',id:playlistId,key:this.key}); const payload=await this.youtube(`playlists?${params}`); const item=payload.items?.[0]; if(!item) throw new BadRequestException('Playlist topilmadi');
    if(item.snippet.channelId && !(await this.db.query(`SELECT 1 FROM education_channels WHERE id=$1 AND youtube_channel_id=$2`,[channelId,item.snippet.channelId]))[0]) throw new BadRequestException('Playlist boshqa kanalga tegishli');
    const rows=await this.db.query(`INSERT INTO education_playlists(youtube_playlist_id,channel_id,title,description,subject,exam_type,level,language,thumbnail_url,is_verified,is_active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true) ON CONFLICT(youtube_playlist_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,subject=EXCLUDED.subject,exam_type=EXCLUDED.exam_type,level=EXCLUDED.level,thumbnail_url=EXCLUDED.thumbnail_url,is_verified=true,is_active=true,updated_at=now() RETURNING id,title`,[playlistId,channelId,item.snippet.title,item.snippet.description||null,String(body.subject||'')||null,String(body.examType||'')||null,String(body.level||'')||null,String(body.language||'uz'),item.snippet.thumbnails?.high?.url||item.snippet.thumbnails?.default?.url||null]);
    return rows[0];
  }

  async syncPlaylist(id: string, userId: string) {
    await this.assertAdmin(userId); this.assertConfigured();
    const rows=await this.db.query(`SELECT p.*,c.youtube_channel_id FROM education_playlists p JOIN education_channels c ON c.id=p.channel_id WHERE p.id=$1 AND p.is_verified AND p.is_active AND c.is_verified`,[id]); const playlist=rows[0]; if(!playlist) throw new BadRequestException('Tasdiqlangan playlist topilmadi');
    const found:string[]=[]; let pageToken='';
    do { const params=new URLSearchParams({part:'contentDetails',playlistId:playlist.youtube_playlist_id,maxResults:'50',key:this.key}); if(pageToken) params.set('pageToken',pageToken); const page=await this.youtube(`playlistItems?${params}`); found.push(...(page.items||[]).map((x:any)=>x.contentDetails?.videoId).filter(Boolean)); pageToken=page.nextPageToken||''; } while(pageToken && found.length<500);
    let synced=0;
    for(let offset=0;offset<found.length;offset+=50){ const ids=found.slice(offset,offset+50); const params=new URLSearchParams({part:'snippet,contentDetails,status',id:ids.join(','),key:this.key}); const data=await this.youtube(`videos?${params}`);
      for(const item of data.items||[]){ const snippet=item.snippet||{}; const seconds=durationSeconds(item.contentDetails?.duration||''); const short=seconds>0&&seconds<=60; const embeddable=item.status?.embeddable!==false; const title=String(snippet.title||'').slice(0,300); const promotional=/\b(vlog|giveaway|aksiya|chegirma|reaction|prank)\b/i.test(`${title} ${snippet.description||''}`); const relevance=promotional?20:playlist.subject?75:55; const quality=playlist.is_verified?75:50;
        await this.db.query(`INSERT INTO education_videos(youtube_video_id,channel_id,playlist_id,title,description,thumbnail_url,published_at,duration_seconds,language,subject,exam_type,level,tags,relevance_score,quality_score,moderation_status,is_embeddable,is_short,is_live,is_available,last_checked_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,true,now()) ON CONFLICT(youtube_video_id) DO UPDATE SET playlist_id=EXCLUDED.playlist_id,title=EXCLUDED.title,description=EXCLUDED.description,thumbnail_url=EXCLUDED.thumbnail_url,duration_seconds=EXCLUDED.duration_seconds,tags=EXCLUDED.tags,relevance_score=EXCLUDED.relevance_score,quality_score=EXCLUDED.quality_score,is_embeddable=EXCLUDED.is_embeddable,is_short=EXCLUDED.is_short,is_live=EXCLUDED.is_live,is_available=true,last_checked_at=now(),updated_at=now()`,[item.id,playlist.channel_id,id,title,snippet.description||null,snippet.thumbnails?.high?.url||snippet.thumbnails?.medium?.url||null,snippet.publishedAt||null,seconds,playlist.language,playlist.subject,playlist.exam_type,playlist.level,snippet.tags||[],relevance,quality,promotional?'rejected':'pending',embeddable,short,snippet.liveBroadcastContent==='live']); synced++; }
    }
    await this.db.query(`UPDATE education_playlists SET last_synced_at=now(),updated_at=now() WHERE id=$1`,[id]); await this.db.query(`UPDATE education_channels SET last_synced_at=now(),updated_at=now() WHERE id=$1`,[playlist.channel_id]); return {found:found.length,synced,pendingModeration:synced};
  }

  async moderate(id:string,status:string,userId:string){ await this.assertAdmin(userId); if(!['approved','rejected','hidden','pending'].includes(status)) throw new BadRequestException('Moderation status noto‘g‘ri'); const rows=await this.db.query(`UPDATE education_videos SET moderation_status=$2,updated_at=now() WHERE id=$1 RETURNING id,moderation_status AS status`,[id,status]); if(!rows[0]) throw new BadRequestException('Video topilmadi'); return rows[0]; }
  private playlistId(source:string){ const value=source.trim(); const fromUrl=value.match(/[?&]list=([\w-]+)/)?.[1]; const id=fromUrl||value; if(!/^[\w-]{10,64}$/.test(id)) throw new BadRequestException('Playlist ID yoki URL noto‘g‘ri'); return id; }
  private assertConfigured(){ if(!this.key) throw new ServiceUnavailableException('YOUTUBE_API_KEY serverda sozlanmagan'); }
  private async assertAdmin(userId:string){ const rows=await this.db.query(`SELECT public_id FROM users WHERE id=$1`,[userId]); if(Number(rows[0]?.public_id)!==777777) throw new ForbiddenException('Education admin ruxsati kerak'); }
  private async youtube(path:string){ const response=await fetch(`https://www.googleapis.com/youtube/v3/${path}`,{signal:AbortSignal.timeout(15000)}); if(!response.ok) throw new ServiceUnavailableException(`YouTube API vaqtincha ishlamadi (${response.status})`); return response.json() as Promise<any>; }
}
