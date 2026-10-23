// FUNCTION 18017be30

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_18017be30(longlong param_1,undefined8 *param_2)

{
  undefined8 uVar1;
  undefined4 uVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  longlong *plVar5;
  char cVar6;
  undefined4 *puVar7;
  longlong *plVar8;
  undefined8 *puVar9;
  undefined4 in_XMM0_Da;
  undefined1 auStack_b8 [32];
  longlong *plStack_98;
  longlong *plStack_90;
  undefined8 *puStack_88;
  longlong *aplStack_78 [2];
  longlong *plStack_68;
  undefined8 uStack_60;
  undefined8 uStack_58;
  undefined8 uStack_50;
  undefined8 uStack_48;
  ulonglong uStack_20;
  
  uStack_20 = _DAT_181f8ca80 ^ (ulonglong)auStack_b8;
  plVar8 = *(longlong **)(param_1 + 0xc0);
  puStack_88 = param_2;
  if (plVar8 == (longlong *)0x0) {
    in_XMM0_Da = __Xbad_function_call_std__YAXXZ();
  }
  (**(code **)(*plVar8 + 0x10))(in_XMM0_Da,&plStack_90);
  if (plStack_90 == (longlong *)0x0) {
    uStack_58 = 0;
    plStack_98 = (longlong *)0x1f;
    puVar7 = (undefined4 *)FUN_180149520(&uStack_60,&plStack_98);
    plVar8 = plStack_90;
    uVar4 = _UNK_181cf9134;
    uVar3 = _UNK_181cf9130;
    uVar2 = _UNK_181cf912c;
    uStack_50 = 0x15;
    uStack_48 = plStack_98;
    plVar5 = uStack_48;
    *puVar7 = _DAT_181cf9128;
    puVar7[1] = uVar2;
    puVar7[2] = uVar3;
    puVar7[3] = uVar4;
    puVar7[4] = _DAT_181cf9138;
    *(undefined1 *)(puVar7 + 5) = DAT_181cf913c;
    *(undefined1 *)((longlong)puVar7 + 0x15) = 0;
    uStack_60._0_4_ = SUB84(puVar7,0);
    uStack_60._4_4_ = (undefined4)((ulonglong)puVar7 >> 0x20);
    uStack_48._0_4_ = SUB84(plStack_98,0);
    uStack_48._4_4_ = (undefined4)((ulonglong)plStack_98 >> 0x20);
    *(undefined4 *)param_2 = (undefined4)uStack_60;
    *(undefined4 *)((longlong)param_2 + 4) = uStack_60._4_4_;
    *(undefined4 *)(param_2 + 1) = (undefined4)uStack_58;
    *(undefined4 *)((longlong)param_2 + 0xc) = uStack_58._4_4_;
    *(undefined4 *)(param_2 + 2) = 0x15;
    *(undefined4 *)((longlong)param_2 + 0x14) = 0;
    *(undefined4 *)(param_2 + 3) = (undefined4)uStack_48;
    *(undefined4 *)((longlong)param_2 + 0x1c) = uStack_48._4_4_;
    *(undefined1 *)(param_2 + 8) = 0;
    *(undefined1 *)(param_2 + 9) = 0;
    uStack_60 = puVar7;
    uStack_48 = plVar5;
    if (plStack_90 != (longlong *)0x0) {
      plStack_90 = (longlong *)0x0;
      (**(code **)(*plVar8 + 0x10))();
    }
  }
  else {
    plVar8 = (longlong *)(**(code **)(*plStack_90 + 0x50))(plStack_90,&UNK_181cf9118,0);
    plStack_68 = plVar8;
    if ((plVar8 == (longlong *)0x0) ||
       (cVar6 = (**(code **)(*plVar8 + 0x28))(plVar8), cVar6 == '\0')) {
      uStack_58 = 0;
      plStack_98 = (longlong *)0x2f;
      puVar7 = (undefined4 *)FUN_180149520(&uStack_60,&plStack_98);
      uVar4 = _UNK_181cf90fc;
      uVar3 = _UNK_181cf90f8;
      uVar2 = _UNK_181cf90f4;
      uStack_50 = 0x27;
      uStack_48 = plStack_98;
      plVar5 = uStack_48;
      *puVar7 = _DAT_181cf90f0;
      puVar7[1] = uVar2;
      puVar7[2] = uVar3;
      puVar7[3] = uVar4;
      uVar1 = _UNK_181cf9108;
      *(undefined8 *)(puVar7 + 4) = _DAT_181cf9100;
      *(undefined8 *)(puVar7 + 6) = uVar1;
      puVar7[8] = _DAT_181cf9110;
      *(undefined2 *)(puVar7 + 9) = _DAT_181cf9114;
      *(undefined1 *)((longlong)puVar7 + 0x26) = DAT_181cf9116;
      *(undefined1 *)((longlong)puVar7 + 0x27) = 0;
      uStack_60._0_4_ = SUB84(puVar7,0);
      uStack_60._4_4_ = (undefined4)((ulonglong)puVar7 >> 0x20);
      uStack_48._0_4_ = SUB84(plStack_98,0);
      uStack_48._4_4_ = (undefined4)((ulonglong)plStack_98 >> 0x20);
      *(undefined4 *)param_2 = (undefined4)uStack_60;
      *(undefined4 *)((longlong)param_2 + 4) = uStack_60._4_4_;
      *(undefined4 *)(param_2 + 1) = (undefined4)uStack_58;
      *(undefined4 *)((longlong)param_2 + 0xc) = uStack_58._4_4_;
      *(undefined4 *)(param_2 + 2) = 0x27;
      *(undefined4 *)((longlong)param_2 + 0x14) = 0;
      *(undefined4 *)(param_2 + 3) = (undefined4)uStack_48;
      *(undefined4 *)((longlong)param_2 + 0x1c) = uStack_48._4_4_;
      *(undefined1 *)(param_2 + 8) = 0;
      *(undefined1 *)(param_2 + 9) = 0;
      uStack_60 = puVar7;
      uStack_48 = plVar5;
      if (plVar8 != (longlong *)0x0) {
        (**(code **)(*plVar8 + 0x10))(plVar8);
      }
      plVar8 = plStack_90;
      if (plStack_90 != (longlong *)0x0) {
        plStack_90 = (longlong *)0x0;
        (**(code **)(*plVar8 + 0x10))();
      }
    }
    else {
      plStack_98 = plVar8;
      (**(code **)(*plVar8 + 8))(plVar8);
      puVar9 = (undefined8 *)FUN_1801ee7d0(aplStack_78,&plStack_98);
      uVar1 = *puVar9;
      *puVar9 = 0;
      *param_2 = uVar1;
      *(undefined1 *)(param_2 + 9) = 1;
      if (aplStack_78[0] != (longlong *)0x0) {
        puVar9 = (undefined8 *)((longlong)*(int *)(*aplStack_78[0] + 4) + (longlong)aplStack_78[0]);
        (**(code **)*puVar9)(puVar9,1);
      }
      (**(code **)(*plVar8 + 0x10))(plVar8);
      plVar8 = plStack_90;
      if (plStack_90 != (longlong *)0x0) {
        plStack_90 = (longlong *)0x0;
        (**(code **)(*plVar8 + 0x10))();
      }
    }
  }
  FUN_180f9eb40(uStack_20 ^ (ulonglong)auStack_b8);
  return;
}


// FUNCTION 1801c4fe0

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1801c4fe0(longlong param_1,undefined8 *param_2,longlong *param_3,undefined8 ***param_4)

{
  longlong *plVar1;
  longlong lVar2;
  code *pcVar3;
  ulonglong uVar4;
  undefined8 ***pppuVar5;
  undefined4 uVar6;
  undefined4 uVar7;
  undefined4 uVar8;
  undefined4 uVar9;
  char cVar10;
  longlong *plVar11;
  undefined8 uVar12;
  ulonglong uVar13;
  undefined8 ****ppppuVar14;
  undefined8 *puVar15;
  ulonglong uVar16;
  bool bVar17;
  undefined1 auStack_238 [32];
  undefined1 uStack_218;
  undefined1 auStack_208 [16];
  longlong *plStack_1f8;
  longlong *plStack_1f0;
  undefined1 auStack_1e8 [64];
  char cStack_1a8;
  undefined1 auStack_198 [40];
  char cStack_170;
  undefined1 auStack_160 [88];
  undefined8 ***apppuStack_108 [2];
  ulonglong uStack_f8;
  ulonglong uStack_f0;
  undefined8 ***pppuStack_e8;
  ulonglong uStack_e0;
  undefined8 uStack_d8;
  undefined8 uStack_d0;
  undefined4 auStack_b8 [2];
  undefined8 uStack_b0;
  undefined8 uStack_a8;
  undefined8 uStack_a0;
  undefined8 uStack_98;
  undefined4 auStack_90 [2];
  undefined8 uStack_88;
  undefined8 uStack_80;
  undefined8 uStack_78;
  undefined8 uStack_70;
  ulonglong uStack_50;
  
  uStack_50 = _DAT_181f8ca80 ^ (ulonglong)auStack_238;
  plVar11 = (longlong *)*param_3;
  plStack_1f8 = param_3;
  if (plVar11 == (longlong *)0x0) {
    uStack_b0 = (undefined8 *)0x0;
    uStack_a8 = 0;
    pppuStack_e8 = (undefined8 ***)0x2f;
    uStack_b0 = (undefined8 *)FUN_180149520(&uStack_b0,&pppuStack_e8);
    uVar12 = _UNK_181cfa358;
    uStack_a0 = 0x2c;
    uStack_98 = pppuStack_e8;
    pppuVar5 = uStack_98;
    *uStack_b0 = _DAT_181cfa350;
    uStack_b0[1] = uVar12;
    uVar12 = _UNK_181cfa368;
    uStack_b0[2] = _DAT_181cfa360;
    uStack_b0[3] = uVar12;
    uStack_b0[4] = _DAT_181cfa370;
    *(undefined4 *)(uStack_b0 + 5) = _DAT_181cfa378;
    *(undefined1 *)((longlong)uStack_b0 + 0x2c) = 0;
    uStack_98._0_4_ = SUB84(pppuStack_e8,0);
    uStack_98._4_4_ = (undefined4)((ulonglong)pppuStack_e8 >> 0x20);
    *(undefined4 *)param_2 = 4;
    param_2[1] = uStack_b0;
    param_2[2] = uStack_a8;
    *(undefined4 *)(param_2 + 3) = 0x2c;
    *(undefined4 *)((longlong)param_2 + 0x1c) = 0;
    *(undefined4 *)(param_2 + 4) = (undefined4)uStack_98;
    *(undefined4 *)((longlong)param_2 + 0x24) = uStack_98._4_4_;
    *(undefined1 *)(param_2 + 5) = 0;
    uStack_98 = pppuVar5;
  }
  else {
    pppuStack_e8 = param_4;
    plVar11 = (longlong *)(**(code **)(*plVar11 + 0x50))(plVar11,&UNK_181cf9118,0);
    plStack_1f0 = plVar11;
    if ((plVar11 == (longlong *)0x0) ||
       (cVar10 = (**(code **)(*plVar11 + 0x28))(plVar11), cVar10 == '\0')) {
      uStack_b0 = (undefined8 *)0x0;
      uStack_a8 = 0;
      pppuStack_e8 = (undefined8 ***)0x2f;
      puVar15 = (undefined8 *)FUN_180149520(&uStack_b0,&pppuStack_e8);
      uVar12 = _UNK_181cfa388;
      uStack_a0 = 0x2f;
      uStack_98 = pppuStack_e8;
      pppuVar5 = uStack_98;
      *puVar15 = _DAT_181cfa380;
      puVar15[1] = uVar12;
      uVar12 = _UNK_181cfa398;
      puVar15[2] = _DAT_181cfa390;
      puVar15[3] = uVar12;
      puVar15[4] = _DAT_181cfa3a0;
      *(undefined4 *)(puVar15 + 5) = _DAT_181cfa3a8;
      *(undefined2 *)((longlong)puVar15 + 0x2c) = _DAT_181cfa3ac;
      *(undefined1 *)((longlong)puVar15 + 0x2e) = DAT_181cfa3ae;
      *(undefined1 *)((longlong)puVar15 + 0x2f) = 0;
      uStack_b0._0_4_ = SUB84(puVar15,0);
      uStack_b0._4_4_ = (undefined4)((ulonglong)puVar15 >> 0x20);
      uStack_98._0_4_ = SUB84(pppuStack_e8,0);
      uStack_98._4_4_ = (undefined4)((ulonglong)pppuStack_e8 >> 0x20);
      *(undefined4 *)param_2 = 0;
      *(undefined4 *)(param_2 + 1) = (undefined4)uStack_b0;
      *(undefined4 *)((longlong)param_2 + 0xc) = uStack_b0._4_4_;
      *(undefined4 *)(param_2 + 2) = (undefined4)uStack_a8;
      *(undefined4 *)((longlong)param_2 + 0x14) = uStack_a8._4_4_;
      *(undefined4 *)(param_2 + 3) = 0x2f;
      *(undefined4 *)((longlong)param_2 + 0x1c) = 0;
      *(undefined4 *)(param_2 + 4) = (undefined4)uStack_98;
      *(undefined4 *)((longlong)param_2 + 0x24) = uStack_98._4_4_;
      *(undefined1 *)(param_2 + 5) = 0;
      uStack_b0 = puVar15;
      uStack_98 = pppuVar5;
      if (plVar11 != (longlong *)0x0) {
        (**(code **)(*plVar11 + 0x10))(plVar11);
      }
      plVar11 = (longlong *)*param_3;
      if (plVar11 != (longlong *)0x0) {
        *param_3 = 0;
        (**(code **)(*plVar11 + 0x10))();
      }
      goto LAB_1801c5539;
    }
    uVar12 = (**(code **)(*plVar11 + 0x30))(plVar11,0);
    FUN_180148a20(apppuStack_108,uVar12,0);
    ppppuVar14 = apppuStack_108;
    if (0xf < uStack_f0) {
      ppppuVar14 = (undefined8 ****)apppuStack_108[0];
    }
    uVar13 = (**(code **)(*plVar11 + 0x50))(plVar11,ppppuVar14,uVar12,0);
    uVar4 = uStack_f8;
    if (uStack_f8 < uVar13) {
      uVar16 = uVar13 - uStack_f8;
      if (uStack_f0 - uStack_f8 < uVar16) {
        uStack_218 = 0;
        FUN_1801497b0(apppuStack_108,uVar16);
        param_4 = pppuStack_e8;
      }
      else {
        ppppuVar14 = apppuStack_108;
        if (0xf < uStack_f0) {
          ppppuVar14 = (undefined8 ****)apppuStack_108[0];
        }
        lVar2 = (longlong)ppppuVar14 + uStack_f8;
        uStack_f8 = uVar13;
        func_0x000180fa0252(lVar2,0,uVar16);
        *(undefined1 *)((longlong)ppppuVar14 + uVar4 + uVar16) = 0;
        param_4 = pppuStack_e8;
      }
    }
    else {
      ppppuVar14 = apppuStack_108;
      if (0xf < uStack_f0) {
        ppppuVar14 = (undefined8 ****)apppuStack_108[0];
      }
      uStack_f8 = uVar13;
      *(undefined1 *)((longlong)ppppuVar14 + uVar13) = 0;
    }
    pppuStack_e8 = apppuStack_108;
    if (0xf < uStack_f0) {
      pppuStack_e8 = apppuStack_108[0];
    }
    uStack_e0 = uStack_f8;
    FUN_180b9b8a0(auStack_1e8,&pppuStack_e8);
    if (cStack_1a8 == '\0') {
      auStack_90[0] = 1;
      uStack_88 = 0;
      uStack_80 = 0;
      pppuStack_e8 = (undefined8 ***)0x2f;
      uStack_b0 = (undefined8 *)FUN_180149520(&uStack_88,&pppuStack_e8);
      uVar12 = _UNK_181cfa440;
      *uStack_b0 = _DAT_181cfa438;
      uStack_b0[1] = uVar12;
      uVar12 = _UNK_181cfa450;
      uStack_b0[2] = _DAT_181cfa448;
      uStack_b0[3] = uVar12;
      *(undefined2 *)(uStack_b0 + 4) = _DAT_181cfa458;
      *(undefined1 *)((longlong)uStack_b0 + 0x22) = DAT_181cfa45a;
      *(undefined1 *)((longlong)uStack_b0 + 0x23) = 0;
      uStack_98 = _UNK_181dbc8f8;
      uStack_a0 = _DAT_181dbc8f0;
      auStack_b8[0] = 1;
      uStack_88._0_4_ = SUB84(uStack_b0,0);
      uVar6 = (undefined4)uStack_88;
      uStack_88._4_4_ = (undefined4)((ulonglong)uStack_b0 >> 0x20);
      uVar7 = uStack_88._4_4_;
      uStack_a8 = uStack_80;
      uStack_70._0_4_ = SUB84(pppuStack_e8,0);
      uVar8 = (undefined4)uStack_70;
      uStack_70._4_4_ = (undefined4)((ulonglong)pppuStack_e8 >> 0x20);
      uVar9 = uStack_70._4_4_;
      uStack_78 = _DAT_181dbc8f0;
      uStack_70 = _UNK_181dbc8f8;
      uStack_88 = (ulonglong)uStack_b0 & 0xffffffffffffff00;
      *(undefined4 *)param_2 = 1;
      *(undefined4 *)(param_2 + 1) = uVar6;
      *(undefined4 *)((longlong)param_2 + 0xc) = uVar7;
      *(undefined4 *)(param_2 + 2) = (undefined4)uStack_80;
      *(undefined4 *)((longlong)param_2 + 0x14) = uStack_80._4_4_;
      *(undefined4 *)(param_2 + 3) = 0x23;
      *(undefined4 *)((longlong)param_2 + 0x1c) = 0;
      *(undefined4 *)(param_2 + 4) = uVar8;
      *(undefined4 *)((longlong)param_2 + 0x24) = uVar9;
      uStack_b0 = (undefined8 *)((ulonglong)uStack_b0 & 0xffffffffffffff00);
      *(undefined1 *)(param_2 + 5) = 0;
      FUN_18014f470(auStack_b8);
      FUN_18014f470(auStack_90);
      FUN_18017aa20(auStack_1e8);
      FUN_180148980(apppuStack_108);
      (**(code **)(*plVar11 + 0x10))(plVar11);
      plVar11 = (longlong *)*param_3;
      if (plVar11 != (longlong *)0x0) {
        *param_3 = 0;
        (**(code **)(*plVar11 + 0x10))();
      }
      goto LAB_1801c5539;
    }
    auStack_208[0] = 0;
    LOCK();
    bVar17 = *(char *)(param_1 + 0x1699) == '\x01';
    if (bVar17) {
      *(char *)(param_1 + 0x1699) = '\0';
    }
    UNLOCK();
    if (bVar17) {
      FUN_1801c7490(param_1 + 0x1600,auStack_208);
    }
    uStack_e0 = 0;
    uStack_d8 = 0;
    uStack_d0 = 7;
    pppuStack_e8 = (undefined8 ***)0x0;
    FUN_1801c7960(param_1 + 0x88,&pppuStack_e8);
    plVar1 = *(longlong **)(param_1 + 0x1690);
    if (plVar1 != (longlong *)*param_3) {
      *(undefined8 *)(param_1 + 0x1690) = 0;
      lVar2 = *param_3;
      *param_3 = 0;
      *(longlong *)(param_1 + 0x1690) = lVar2;
      if (plVar1 != (longlong *)0x0) {
        (**(code **)(*plVar1 + 0x10))();
      }
    }
    if (cStack_1a8 == '\0') {
      uVar12 = func_0x0001801550b0(auStack_1e8);
      uVar12 = func_0x0001801550b0(uVar12);
      uVar12 = FUN_180187800(auStack_90,uVar12);
      uVar12 = FUN_180186ee0(auStack_160,uVar12);
      FUN_180185af0(uVar12);
      pcVar3 = (code *)swi(3);
      (*pcVar3)();
      return;
    }
    FUN_1801c0b40(param_1,auStack_198,auStack_1e8,param_4);
    if (cStack_170 == '\0') {
      func_0x0001801c4f90(param_2,auStack_198);
      FUN_1801ba3d0(auStack_198);
      FUN_18017aa20(auStack_1e8);
      FUN_180148980(apppuStack_108);
      (**(code **)(*plVar11 + 0x10))(plVar11);
    }
    else {
      FUN_180192450(param_1 + 0x780,*(undefined8 *)(param_1 + 0x1690));
      FUN_1801a4d10(param_1 + 0xf90);
      FUN_1801c63b0(param_1);
      *param_2 = 0;
      param_2[1] = 0;
      param_2[2] = 0;
      param_2[3] = 0;
      param_2[4] = 0;
      param_2[5] = 0;
      param_2[6] = 0;
      *(undefined1 *)param_2 = 0;
      *(undefined1 *)(param_2 + 5) = 1;
      FUN_1801ba3d0(auStack_198);
      FUN_18017aa20(auStack_1e8);
      FUN_180148980(apppuStack_108);
      (**(code **)(*plVar11 + 0x10))(plVar11);
    }
  }
  plVar11 = (longlong *)*param_3;
  if (plVar11 != (longlong *)0x0) {
    *param_3 = 0;
    (**(code **)(*plVar11 + 0x10))();
  }
LAB_1801c5539:
  FUN_180f9eb40(uStack_50 ^ (ulonglong)auStack_238);
  return;
}


