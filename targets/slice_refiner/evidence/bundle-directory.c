// FUNCTION 1805e20f0

/* WARNING: Type propagation algorithm not settling */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1805e20f0(longlong param_1,longlong *param_2,int *param_3)

{
  longlong *******ppppppplVar1;
  longlong *plVar2;
  short *psVar3;
  uint uVar4;
  longlong lVar5;
  longlong *****ppppplVar6;
  code *pcVar7;
  short *psVar8;
  int iVar9;
  longlong *******ppppppplVar10;
  uint *puVar11;
  longlong lVar12;
  ushort *puVar13;
  longlong ******pppppplVar14;
  undefined2 *puVar15;
  char *pcVar16;
  longlong *plVar17;
  longlong lVar18;
  ulonglong uVar19;
  undefined1 auStack_1a8 [32];
  longlong *******ppppppplStack_188;
  undefined8 uStack_178;
  ulonglong uStack_170;
  longlong *******ppppppplStack_168;
  ulonglong *puStack_160;
  ulonglong uStack_158;
  undefined8 uStack_150;
  longlong ******pppppplStack_140;
  longlong ******pppppplStack_138;
  ulonglong uStack_130;
  longlong *******ppppppplStack_128;
  longlong ******pppppplStack_120;
  longlong *****ppppplStack_118;
  undefined8 uStack_110;
  undefined8 uStack_100;
  longlong *******ppppppplStack_e8;
  ulonglong uStack_e0;
  longlong *******ppppppplStack_d8;
  undefined8 uStack_d0;
  undefined1 auStack_c8 [24];
  longlong alStack_b0 [3];
  longlong *******ppppppplStack_98;
  undefined8 uStack_90;
  ulonglong uStack_88;
  ulonglong uStack_80;
  longlong ******apppppplStack_78 [2];
  longlong lStack_68;
  ulonglong uStack_60;
  ulonglong uStack_58;
  
  uStack_58 = _DAT_181f8ca80 ^ (ulonglong)auStack_1a8;
  uStack_178 = (longlong *******)&uStack_150;
  uStack_170 = 4;
  puStack_160 = (ulonglong *)0x4;
  ppppppplStack_168 = uStack_178;
  FUN_1805e4840(param_2,&ppppppplStack_168);
  if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) == _DAT_181f906d8) && (*param_3 == 0)) {
    puVar11 = (uint *)&uStack_150;
    do {
      uVar4 = *puVar11;
      *puVar11 = uVar4 >> 0x18 | (uVar4 & 0xff0000) >> 8 | (uVar4 & 0xff00) << 8 | uVar4 << 0x18;
      puVar11 = puVar11 + 1;
    } while (puVar11 != (uint *)((longlong)&uStack_150 + 4));
  }
  if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) == _DAT_181f906d8) && (*param_3 == 0)) {
    uStack_178 = (longlong *******)&uStack_110;
    uStack_170 = 4;
    puStack_160 = (ulonglong *)0x4;
    ppppppplStack_168 = uStack_178;
    FUN_1805e4840(param_2,&ppppppplStack_168,param_3);
    if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) == _DAT_181f906d8) && (*param_3 == 0)) {
      puVar11 = (uint *)&uStack_110;
      do {
        uVar4 = *puVar11;
        *puVar11 = uVar4 >> 0x18 | (uVar4 & 0xff0000) >> 8 | (uVar4 & 0xff00) << 8 | uVar4 << 0x18;
        puVar11 = puVar11 + 1;
      } while (puVar11 != (uint *)((longlong)&uStack_110 + 4));
    }
    if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) == _DAT_181f906d8) && (*param_3 == 0)) {
      ppppppplVar10 = (longlong *******)(param_1 + 0x48);
      uStack_170 = 1;
      puStack_160 = (ulonglong *)0x1;
      uStack_178 = ppppppplVar10;
      ppppppplStack_168 = ppppppplVar10;
      FUN_1805e4840(param_2,&ppppppplStack_168,param_3);
      if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) == _DAT_181f906d8) && (*param_3 == 0)) {
        ppppppplVar1 = (longlong *******)(param_1 + 0x20);
        uStack_170 = 8;
        puStack_160 = (ulonglong *)0x8;
        uStack_178 = ppppppplVar1;
        ppppppplStack_168 = ppppppplVar1;
        FUN_1805e4840(param_2,&ppppppplStack_168,param_3);
        if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) == _DAT_181f906d8) && (*param_3 == 0)) {
          if (*param_2 == 0) {
            uStack_178 = (longlong *******)CONCAT44(uStack_178._4_4_,0x16);
            uStack_170 = 0x181f906c0;
            *param_3 = 0x16;
            param_3[1] = uStack_178._4_4_;
            param_3[2] = -0x7e06f940;
            param_3[3] = 1;
          }
          else {
            iVar9 = _fseeki64(*param_2,0x40,0);
            if (iVar9 == 0) {
              lVar18 = _ftelli64(*param_2);
              param_2[1] = lVar18;
            }
            else {
              uStack_178 = (longlong *******)CONCAT44(uStack_178._4_4_,5);
              uStack_170 = 0x181f906c0;
              *param_3 = 5;
              param_3[1] = uStack_178._4_4_;
              param_3[2] = -0x7e06f940;
              param_3[3] = 1;
            }
          }
          if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) == _DAT_181f906d8) && (*param_3 == 0))
          {
            if (*ppppppplVar1 != (longlong ******)0x0) {
              FUN_1805e45b0(param_2,ppppppplVar1,param_1 + 0x28);
            }
            uStack_90 = 0;
            uStack_88 = 0;
            uStack_80 = 0xf;
            ppppppplStack_98 = (longlong *******)0x0;
            uStack_158 = (ulonglong)((uint)uStack_110 + 0x40) + 0x3f & 0xffffffffffffffc0;
            if (*(char *)ppppppplVar10 != '\0') {
              *(undefined1 *)(param_1 + 0x50) = 1;
              plVar2 = (longlong *)(param_1 + 0x58);
              if (alStack_b0 != plVar2) {
                lVar18 = *(longlong *)(param_1 + 0x60);
                plVar17 = (longlong *)*plVar2;
                while (lVar18 != 0) {
                  lVar18 = lVar18 + -1;
                  if (7 < (ulonglong)plVar17[3]) {
                    lVar5 = *plVar17;
                    lVar12 = lVar5;
                    if ((0xfff < plVar17[3] * 2 + 2U) &&
                       (lVar12 = *(longlong *)(lVar5 + -8), 0x1f < (lVar5 - lVar12) - 8U))
                    goto LAB_1805e27f8;
                    _aligned_free(lVar12);
                  }
                  plVar17[2] = 0;
                  plVar17[3] = 7;
                  *(undefined2 *)plVar17 = 0;
                  plVar17 = plVar17 + 6;
                }
                *(undefined8 *)(param_1 + 0x60) = 0;
                if (*plVar2 != 0) {
                  _aligned_free();
                }
                *plVar2 = 0;
                *(undefined8 *)(param_1 + 0x60) = 0;
                *(undefined8 *)(param_1 + 0x68) = 0;
              }
            }
            uVar19 = (ulonglong)(uint)uStack_150;
            if (*(ulonglong *)(param_1 + 0x68) < uVar19) {
              FUN_1805e3870(param_1 + 0x58,(uint)uStack_150);
              uVar19 = (ulonglong)(uint)uStack_150;
            }
            if (*(ulonglong *)(param_1 + 0x60) < uVar19) {
              do {
                uStack_170 = 2;
                uStack_178 = (longlong *******)&uStack_100;
                FUN_1805e4840(param_2,&uStack_178,param_3);
                if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) == _DAT_181f906d8) &&
                   (*param_3 == 0)) {
                  puVar13 = (ushort *)&uStack_100;
                  do {
                    *puVar13 = *puVar13 >> 8 | *puVar13 << 8;
                    puVar13 = puVar13 + 1;
                  } while (puVar13 != (ushort *)((longlong)&uStack_100 + 2));
                }
                if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) != _DAT_181f906d8) ||
                   (*param_3 != 0)) {
                  if (uStack_80 < 0x10) goto LAB_1805e28d2;
                  ppppppplVar10 = ppppppplStack_98;
                  if (0xfff < uStack_80 + 1) {
                    ppppppplVar10 = (longlong *******)ppppppplStack_98[-1];
                    pcVar16 = (char *)((longlong)ppppppplStack_98 + (-8 - (longlong)ppppppplVar10));
joined_r0x0001805e28b0:
                    if ((char *)0x1f < pcVar16) {
LAB_1805e28b2:
                      ppppppplStack_188 = (longlong *******)0x0;
                      _invoke_watson(0,0,0,0);
                      pcVar7 = (code *)swi(3);
                      (*pcVar7)();
                      return;
                    }
                  }
                  goto LAB_1805e28cb;
                }
                uVar19 = (ulonglong)(ushort)uStack_100;
                if (uStack_88 < uVar19) {
                  uVar19 = uVar19 - uStack_88;
                  if (uStack_80 - uStack_88 < uVar19) {
                    ppppppplStack_188 =
                         (longlong *******)((ulonglong)ppppppplStack_188 & 0xffffffffffffff00);
                    FUN_1801497b0(&ppppppplStack_98,uVar19);
                  }
                  else {
                    ppppppplVar10 = (longlong *******)&ppppppplStack_98;
                    if (0xf < uStack_80) {
                      ppppppplVar10 = ppppppplStack_98;
                    }
                    pcVar16 = (char *)((longlong)ppppppplVar10 + uStack_88);
                    uStack_88 = uStack_88 + uVar19;
                    func_0x000180fa0252(pcVar16,0,uVar19);
                    pcVar16[uVar19] = '\0';
                  }
                }
                else {
                  ppppppplVar10 = (longlong *******)&ppppppplStack_98;
                  if (0xf < uStack_80) {
                    ppppppplVar10 = ppppppplStack_98;
                  }
                  uStack_88 = uVar19;
                  *(char *)((longlong)ppppppplVar10 + uVar19) = '\0';
                }
                uStack_178 = (longlong *******)&ppppppplStack_98;
                if (0xf < uStack_80) {
                  uStack_178 = ppppppplStack_98;
                }
                uStack_e0 = uStack_88;
                uStack_170 = uStack_88;
                ppppppplStack_e8 = uStack_178;
                FUN_1805e4840(param_2,&uStack_178,param_3);
                if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) != _DAT_181f906d8) ||
                   (*param_3 != 0)) {
LAB_1805e2856:
                  if (uStack_80 < 0x10) goto LAB_1805e28d2;
                  ppppppplVar10 = ppppppplStack_98;
                  if (0xfff < uStack_80 + 1) {
                    ppppppplVar10 = (longlong *******)ppppppplStack_98[-1];
                    pcVar16 = (char *)((longlong)ppppppplStack_98 + (-8 - (longlong)ppppppplVar10));
                    goto joined_r0x0001805e28b0;
                  }
                  goto LAB_1805e28cb;
                }
                uStack_178 = &pppppplStack_120;
                uStack_d0 = 8;
                uStack_170 = 8;
                ppppppplStack_d8 = uStack_178;
                FUN_1805e4840(param_2,&uStack_178,param_3);
                if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) == _DAT_181f906d8) &&
                   (*param_3 == 0)) {
                  pppppplVar14 = (longlong ******)&pppppplStack_120;
                  do {
                    ppppplVar6 = *pppppplVar14;
                    *pppppplVar14 =
                         (longlong *****)
                         ((ulonglong)ppppplVar6 >> 0x38 |
                          ((ulonglong)ppppplVar6 & 0xff000000000000) >> 0x28 |
                          ((ulonglong)ppppplVar6 & 0xff0000000000) >> 0x18 |
                          ((ulonglong)ppppplVar6 & 0xff00000000) >> 8 |
                          ((ulonglong)ppppplVar6 & 0xff000000) << 8 |
                          ((ulonglong)ppppplVar6 & 0xff0000) << 0x18 |
                          ((ulonglong)ppppplVar6 & 0xff00) << 0x28 | (longlong)ppppplVar6 << 0x38);
                    pppppplVar14 = pppppplVar14 + 1;
                  } while (pppppplVar14 != &ppppplStack_118);
                }
                uVar19 = uStack_88;
                if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) != _DAT_181f906d8) ||
                   (*param_3 != 0)) goto LAB_1805e2856;
                pppppplStack_140 = (longlong ******)0x0;
                pppppplStack_138 = (longlong ******)0x0;
                uStack_130 = 0;
                ppppppplStack_128 = (longlong *******)0x0;
                ppppppplVar10 = (longlong *******)&ppppppplStack_98;
                if (0xf < uStack_80) {
                  ppppppplVar10 = ppppppplStack_98;
                }
                if (0x7fffffffffffffff < uStack_88) {
                  FUN_180145e10();
                  pcVar7 = (code *)swi(3);
                  (*pcVar7)();
                  return;
                }
                if (uStack_88 < 0x10) {
                  uStack_130 = uStack_88;
                  ppppppplStack_128 = (longlong *******)0xf;
                  pppppplStack_140 = *ppppppplVar10;
                  pppppplStack_138 = ppppppplVar10[1];
                }
                else {
                  uStack_178 = (longlong *******)(uStack_88 | 0xf);
                  if (uStack_178 < (longlong *******)0x8000000000000000) {
                    if (uStack_178 < (longlong *******)0x16) {
                      uStack_178 = (longlong *******)0x16;
                    }
                  }
                  else {
                    uStack_178 = (longlong *******)0x7fffffffffffffff;
                  }
                  pppppplStack_140 = (longlong ******)FUN_180149520(&pppppplStack_140,&uStack_178);
                  uStack_130 = uVar19;
                  ppppppplStack_128 = uStack_178;
                  func_0x000180fa025e(pppppplStack_140,ppppppplVar10,uVar19 + 1);
                }
                FUN_1805e4c70(apppppplStack_78,&pppppplStack_140,param_3);
                if ((*(longlong *)(*(longlong *)(param_3 + 2) + 8) != _DAT_181f906d8) ||
                   (*param_3 != 0)) {
                  if (7 < uStack_60) {
                    if ((0xfff < uStack_60 * 2 + 2) &&
                       (0x1f < (CONCAT62(apppppplStack_78[0]._2_6_,(short)apppppplStack_78[0]) -
                               *(longlong *)
                                (CONCAT62(apppppplStack_78[0]._2_6_,(short)apppppplStack_78[0]) + -8
                                )) - 8U)) goto LAB_1805e28b2;
                    _aligned_free();
                  }
                  lStack_68 = 0;
                  uStack_60 = 7;
                  apppppplStack_78[0]._0_2_ = 0;
                  goto LAB_1805e2856;
                }
                puVar15 = (undefined2 *)apppppplStack_78;
                if (7 < uStack_60) {
                  puVar15 = (undefined2 *)
                            CONCAT62(apppppplStack_78[0]._2_6_,(short)apppppplStack_78[0]);
                }
                psVar3 = puVar15 + lStack_68;
                psVar8 = (short *)apppppplStack_78;
                if (7 < uStack_60) {
                  psVar8 = (short *)CONCAT62(apppppplStack_78[0]._2_6_,(short)apppppplStack_78[0]);
                }
                for (; psVar8 != psVar3; psVar8 = psVar8 + 1) {
                  if (*psVar8 == 0x2f) {
                    *psVar8 = 0x5c;
                  }
                }
                ppppppplStack_168 = &pppppplStack_120;
                puStack_160 = &uStack_158;
                uStack_178 = apppppplStack_78;
                ppppppplStack_188 = (longlong *******)&ppppppplStack_168;
                FUN_1805e3460(param_1 + 0x50,auStack_c8);
                uStack_158 = (longlong)pppppplStack_120 + uStack_158 + 0x3f & 0xffffffffffffffc0;
                if (7 < uStack_60) {
                  if ((0xfff < uStack_60 * 2 + 2) &&
                     (0x1f < (CONCAT62(apppppplStack_78[0]._2_6_,(short)apppppplStack_78[0]) -
                             *(longlong *)
                              (CONCAT62(apppppplStack_78[0]._2_6_,(short)apppppplStack_78[0]) + -8))
                             - 8U)) goto LAB_1805e28b2;
                  _aligned_free();
                }
              } while (*(ulonglong *)(param_1 + 0x60) < (ulonglong)(uint)uStack_150);
            }
            if (0xf < uStack_80) {
              ppppppplVar10 = ppppppplStack_98;
              if ((0xfff < uStack_80 + 1) &&
                 (ppppppplVar10 = (longlong *******)ppppppplStack_98[-1],
                 (char *)0x1f <
                 (char *)((longlong)ppppppplStack_98 + (-8 - (longlong)ppppppplStack_98[-1])))) {
LAB_1805e27f8:
                ppppppplStack_188 = (longlong *******)0x0;
                _invoke_watson(0,0,0,0);
                pcVar7 = (code *)swi(3);
                (*pcVar7)();
                return;
              }
LAB_1805e28cb:
              _aligned_free(ppppppplVar10);
            }
          }
        }
      }
    }
  }
LAB_1805e28d2:
  FUN_180f9eb40(uStack_58 ^ (ulonglong)auStack_1a8);
  return;
}


