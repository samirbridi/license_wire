import ctypes as c,json,pathlib,subprocess,time,sys,re,hashlib
r=pathlib.Path(__file__).resolve().parents[2]
suffix=sys.argv[1] if len(sys.argv)>1 else 'baseline-0035'
mode=sys.argv[2] if len(sys.argv)>2 else 'auto'
delay=float(sys.argv[3]) if len(sys.argv)>3 else 0
reconnect=len(sys.argv)>4 and sys.argv[4]=='reconnect'
lib=c.CDLL(str(r/'dist/Processing.NDI.Lib.x64.dll'))
class Source(c.Structure):_fields_=[('name',c.c_char_p),('address',c.c_char_p)]
class Finder(c.Structure):_fields_=[('local',c.c_bool),('groups',c.c_char_p),('ips',c.c_char_p)]
class Receiver(c.Structure):_fields_=[('source',Source),('format',c.c_int),('bandwidth',c.c_int),('fields',c.c_bool),('name',c.c_char_p)]
class Video(c.Structure):_fields_=[('w',c.c_int),('h',c.c_int),('fourcc',c.c_int),('n',c.c_int),('d',c.c_int),('aspect',c.c_float),('format',c.c_int),('tc',c.c_int64),('data',c.c_void_p),('stride',c.c_int),('metadata',c.c_char_p),('timestamp',c.c_int64)]
class Audio(c.Structure):_fields_=[('rate',c.c_int),('channels',c.c_int),('samples',c.c_int),('tc',c.c_int64),('data',c.POINTER(c.c_float)),('stride',c.c_int),('metadata',c.c_char_p),('timestamp',c.c_int64)]
def api(name,restype,args):
 f=getattr(lib,'NDIlib_'+name);f.restype=restype;f.argtypes=args;return f
initialize=api('initialize',c.c_bool,[]);destroy=api('destroy',None,[])
find=api('find_create_v2',c.c_void_p,[c.POINTER(Finder)]);sources=api('find_get_current_sources',c.POINTER(Source),[c.c_void_p,c.POINTER(c.c_uint)]);freefind=api('find_destroy',None,[c.c_void_p])
recv=api('recv_create_v3',c.c_void_p,[c.POINTER(Receiver)]);capture=api('recv_capture_v2',c.c_int,[c.c_void_p,c.POINTER(Video),c.POINTER(Audio),c.c_void_p,c.c_uint]);freev=api('recv_free_video_v2',None,[c.c_void_p,c.POINTER(Video)]);freea=api('recv_free_audio_v2',None,[c.c_void_p,c.POINTER(Audio)]);freerecv=api('recv_destroy',None,[c.c_void_p])
assert initialize();finder=find(c.byref(Finder(True,None,None)));receiver=None
out=r/'evidence'/('ndi-external-'+suffix+'.json');child_result=r/'evidence'/('network-probe-'+suffix+'.json')
args=[__import__('os').environ.get('MIZIN_PROBE_EXE',str(r/'dist/MizinPlayout.exe')),'--network-test','--fixtures',str(r/'binaries/network-fixtures'),'--result',str(child_result)]
args+=['--state-dir',str(r/'binaries/qa'/('external-state-'+suffix))]
if mode=='cpu':args+=['--cpu']
log=(r/'binaries/qa'/('ndi-probe-'+suffix+'.log')).open('wb')
child=subprocess.Popen(args,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
frames=[];audio=0;peak=0;selected=None;deadline=time.monotonic()+35;connect_after=time.monotonic()+delay;reconnected=False
try:
 while time.monotonic()<deadline:
  if receiver is None:
   if time.monotonic()<connect_after:time.sleep(.01);continue
   count=c.c_uint();items=sources(finder,c.byref(count))
   for i in range(count.value):
    name=items[i].name or b''
    if ('Mizin QA NDI '+str(child.pid)).encode() in name:
     selected=name.decode();src=Source(name,items[i].address);receiver=recv(c.byref(Receiver(src,0,100,False,b'Mizin external QA')));break
   if child.poll() is not None:break
   time.sleep(.02);continue
  v=Video();a=Audio();typ=capture(receiver,c.byref(v),c.byref(a),None,5)
  if typ==1:
   if len(frames)<300:
    match=re.search(rb'<mizin_frame sequence="([0-9]+)"',v.metadata or b'')
    digest=hashlib.sha256(c.string_at(v.data,v.stride*v.h)).hexdigest() if v.data and v.stride>0 and v.h>0 else ''
    frames.append(dict(sequence=int(match[1]) if match else -1,pixels_sha256=digest,timecode=v.tc,sdk_timestamp=v.timestamp,width=v.w,height=v.h,rate_n=v.n,rate_d=v.d))
   freev(receiver,c.byref(v))
  elif typ==2:
   audio+=1
   if a.data and a.rate==48000 and a.channels==2:peak=max(peak,max((abs(a.data[i]) for i in range(min(a.samples,480))),default=0))
   freea(receiver,c.byref(a))
  if reconnect and not reconnected and len(frames)>=8:
   freerecv(receiver);receiver=None;connect_after=time.monotonic()+.25;reconnected=True
  if child.poll() is not None:break
 child.wait(timeout=10)
finally:
 if child.poll() is None:child.terminate();child.wait(timeout=10)
 if receiver:freerecv(receiver)
 freefind(finder);destroy();log.close()
video=[x for x in frames if x['width']==1920 and x['height']==1080]
bad=[dict(index=i,previous=video[i-1],current=video[i]) for i in range(1,len(video)) if video[i]['timecode']<=video[i-1]['timecode']]
errors=[];cached=0
for i,frame in enumerate(video):
 if frame['sequence']<0 or not frame['pixels_sha256']:errors.append(dict(index=i,reason='missing source metadata/content'))
 if i:
  previous=video[i-1]
  if frame['sdk_timestamp']<=previous['sdk_timestamp']:errors.append(dict(index=i,reason='SDK delivery timestamp did not increase'))
  if frame['sequence']==previous['sequence']:
   cached+=1
   if frame['timecode']!=previous['timecode'] or frame['pixels_sha256']!=previous['pixels_sha256']:errors.append(dict(index=i,reason='same source ID changed timecode/content'))
  elif frame['sequence']<=previous['sequence'] or frame['timecode']<=previous['timecode']:errors.append(dict(index=i,reason='distinct source frame regressed sequence/timecode'))
report=dict(result='PASS' if len(video)>=8 and audio>=8 and peak>.001 and not errors and (not reconnect or reconnected) and child.returncode==0 else 'FAIL',source=selected,mode=mode,delay=delay,reconnected=reconnected,video_frames=len(video),audio_packets=audio,audio_peak=peak,raw_timecode_repeats_or_regressions=bad,verified_exact_cache_repeats=cached,order_errors=errors,frames=frames,child_exit=child.returncode,child_result=str(child_result),probe_sha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),args=args,scope='Strict source sequence/timecode/content and SDK delivery timestamps; identical cache replay is counted explicitly. Independent receiver process on same Windows computer, not another LAN machine or physical AV-sync.')
out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:report[k] for k in ('result','video_frames','audio_packets','audio_peak','child_exit')}))
