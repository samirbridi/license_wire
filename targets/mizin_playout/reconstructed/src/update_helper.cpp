#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shellapi.h>
#include <bcrypt.h>
#include <filesystem>
#include <string>
#include <map>
#include <vector>
#include <algorithm>
#include <cwctype>

static bool qa=false;
static const wchar_t* statusText=L"Installing Mizin Playout…\nPlease wait. Your preferences and media are preserved.";
static int failure(const wchar_t* message,int code){if(!qa)MessageBoxW(nullptr,message,L"Mizin Playout Update",MB_OK|MB_ICONERROR);return code;}
static std::wstring quote(const std::wstring& text){
    std::wstring result=L"\"";int slashes=0;
    for(auto ch:text){if(ch==L'\\'){++slashes;continue;}if(ch==L'\"')result.append(slashes*2+1,L'\\');else result.append(slashes,L'\\');slashes=0;result+=ch;}
    result.append(slashes*2,L'\\');return result+L"\"";
}
static std::wstring canonical(const std::wstring& path){std::error_code error;auto value=std::filesystem::weakly_canonical(path,error).wstring();if(error)return {};std::transform(value.begin(),value.end(),value.begin(),[](wchar_t c){return wchar_t(towlower(c));});return value;}
static bool verified(HANDLE file,const std::wstring& wanted,ULONGLONG bytes){
    LARGE_INTEGER length{};if(!GetFileSizeEx(file,&length)||ULONGLONG(length.QuadPart)!=bytes)return false;
    BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;bool ok=false;DWORD objectSize=0,resultSize=0;
    if(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)return false;
    if(BCryptGetProperty(algorithm,BCRYPT_OBJECT_LENGTH,reinterpret_cast<PUCHAR>(&objectSize),sizeof(objectSize),&resultSize,0)>=0){
        std::vector<UCHAR> object(objectSize),buffer(1024*1024),digest(32);
        if(BCryptCreateHash(algorithm,&hash,object.data(),objectSize,nullptr,0,0)>=0){
            DWORD read=0;ok=true;
            while(true){if(!ReadFile(file,buffer.data(),DWORD(buffer.size()),&read,nullptr)){ok=false;break;}if(!read)break;if(BCryptHashData(hash,buffer.data(),read,0)<0){ok=false;break;}}
            if(ok&&BCryptFinishHash(hash,digest.data(),DWORD(digest.size()),0)>=0){std::wstring hex;for(auto value:digest){hex+=L"0123456789abcdef"[value>>4];hex+=L"0123456789abcdef"[value&15];}ok=hex==wanted;}else ok=false;
            BCryptDestroyHash(hash);
        }
    }BCryptCloseAlgorithmProvider(algorithm,0);return ok;
}
static LRESULT CALLBACK windowProc(HWND hwnd,UINT message,WPARAM w,LPARAM l){
    if(message==WM_CLOSE)return 0;
    if(message==WM_PAINT){PAINTSTRUCT paint;auto dc=BeginPaint(hwnd,&paint);RECT rect;GetClientRect(hwnd,&rect);auto brush=CreateSolidBrush(RGB(13,21,31));FillRect(dc,&rect,brush);DeleteObject(brush);SetBkMode(dc,TRANSPARENT);SetTextColor(dc,RGB(228,237,246));rect.left+=20;rect.right-=20;DrawTextW(dc,statusText,-1,&rect,DT_CENTER|DT_VCENTER|DT_WORDBREAK);EndPaint(hwnd,&paint);return 0;}
    return DefWindowProcW(hwnd,message,w,l);
}
static bool waitProcess(HANDLE process,DWORD limit){
    DWORD elapsed=0;while(WaitForSingleObject(process,50)==WAIT_TIMEOUT){MSG message;while(PeekMessageW(&message,nullptr,0,0,PM_REMOVE)){TranslateMessage(&message);DispatchMessageW(&message);}elapsed+=50;if(elapsed>=limit)return false;}return true;
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,PWSTR,int){
    int count=0;auto argv=CommandLineToArgvW(GetCommandLineW(),&count);if(!argv)return 2;std::map<std::wstring,std::wstring> args;
    for(int i=1;i<count;++i){std::wstring key=argv[i];if(key==L"--qa"||key==L"--no-restart"||key==L"--portable")args[key]=L"1";else if(i+1<count)args[key]=argv[++i];else{LocalFree(argv);return 2;}}LocalFree(argv);qa=args.contains(L"--qa");
    const auto target=args[L"--target"],restart=args[L"--restart"],installer=args[L"--installer"],hash=args[L"--sha256"];
    if(target.empty()||canonical(restart)!=canonical((std::filesystem::path(target)/L"MizinPlayout.exe").wstring())||!std::filesystem::is_directory(target)||hash.size()!=64||!std::all_of(hash.begin(),hash.end(),[](wchar_t c){return (c>=L'0'&&c<=L'9')||(c>=L'a'&&c<=L'f');}))return failure(L"Invalid update handoff. Nothing was installed.",2);
    ULONGLONG size=0;DWORD pid=0;try{size=std::stoull(args[L"--size"]);pid=std::stoul(args[L"--parent-pid"]);}catch(...){return failure(L"Invalid update handoff. Nothing was installed.",2);}
    if(!pid||!size||size>512ULL*1024*1024)return failure(L"Invalid update handoff. Nothing was installed.",2);
    HANDLE parent=OpenProcess(SYNCHRONIZE|PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid);
    if(parent){wchar_t name[32768];DWORD length=32768;if(!QueryFullProcessImageNameW(parent,0,name,&length)||canonical(name)!=canonical(restart)){CloseHandle(parent);return failure(L"The running application does not match this update.",3);}}
    if(!parent&&GetLastError()!=ERROR_INVALID_PARAMETER)return failure(L"Could not inspect the running application. Nothing was installed.",3);
    HANDLE file=CreateFileW(installer.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);
    if(file==INVALID_HANDLE_VALUE||!verified(file,hash,size)){if(file!=INVALID_HANDLE_VALUE)CloseHandle(file);if(parent)CloseHandle(parent);return failure(L"Update file verification failed. Nothing was installed.",4);}
    if(args[L"--lang"]==L"pt-BR")statusText=L"Instalando Mizin Playout…\nAguarde. Suas preferências e mídias serão preservadas.";
    HWND window=nullptr;
    if(!qa){WNDCLASSW wc{};wc.hInstance=instance;wc.lpfnWndProc=windowProc;wc.lpszClassName=L"MizinUpdateStatus";wc.hIcon=LoadIconW(instance,L"IDI_ICON1");RegisterClassW(&wc);window=CreateWindowExW(WS_EX_TOPMOST,wc.lpszClassName,L"Mizin Playout",WS_CAPTION|WS_SYSMENU,(GetSystemMetrics(SM_CXSCREEN)-440)/2,(GetSystemMetrics(SM_CYSCREEN)-140)/2,440,140,nullptr,nullptr,instance,nullptr);ShowWindow(window,SW_SHOW);UpdateWindow(window);}
    if(parent){const bool closed=waitProcess(parent,90000);CloseHandle(parent);if(!closed){CloseHandle(file);if(window)DestroyWindow(window);return failure(L"Close Mizin Playout before installing the update. Nothing was installed.",5);}}
    std::wstring command=quote(installer)+L" /S";
    if(args.contains(L"--portable"))command+=L" /PORTABLE";if(qa)command+=L" /QA";
    // NSIS /D= consumes the remainder, without surrounding quotes.
    command+=L" /D="+target;STARTUPINFOW startup{};startup.cb=sizeof(startup);startup.dwFlags=STARTF_USESHOWWINDOW;startup.wShowWindow=SW_HIDE;PROCESS_INFORMATION child{};
    const bool started=CreateProcessW(installer.c_str(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,std::filesystem::path(installer).parent_path().c_str(),&startup,&child);CloseHandle(file);
    if(!started){if(window)DestroyWindow(window);return failure(L"Could not start the verified installer.",6);}
    CloseHandle(child.hThread);const bool finished=waitProcess(child.hProcess,600000);DWORD exit=1;if(finished)GetExitCodeProcess(child.hProcess,&exit);CloseHandle(child.hProcess);if(window)DestroyWindow(window);
    if(!finished)return failure(L"Installation is still running. Open Mizin Playout after it finishes.",7);
    if(exit!=0&&exit!=3010)return failure(L"The update installer could not finish. Your show files and preferences were kept.",8);
    if(!args.contains(L"--no-restart")){
        std::wstring launch=quote(restart)+L" --state-dir "+quote(args[L"--state-dir"]);if(args.contains(L"--portable"))launch+=L" --portable";
        if(!args[L"--show"].empty())launch+=L" --show "+quote(args[L"--show"]);if(!args[L"--lang"].empty())launch+=L" --lang "+quote(args[L"--lang"]);
        PROCESS_INFORMATION app{};if(!CreateProcessW(restart.c_str(),launch.data(),nullptr,nullptr,FALSE,0,nullptr,target.c_str(),&startup,&app))return failure(L"Update installed. Open Mizin Playout from its shortcut.",9);CloseHandle(app.hThread);CloseHandle(app.hProcess);
    }return 0;
}
